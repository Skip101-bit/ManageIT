using System.Security.Claims;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using ManageIT.Api;
using ManageIT.Api.Models;
using ManageIT.Api.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddSingleton<ManageItDataService>();
builder.Services.AddSingleton<JwtTokenService>();
builder.Services.AddSingleton<PermissionService>();
builder.Services.ConfigureHttpJsonOptions(o =>
{
    o.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
    o.SerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull;
});

var jwtSecret = builder.Configuration["Jwt:Secret"]
    ?? throw new InvalidOperationException("Jwt:Secret is not configured.");
var jwtIssuer = builder.Configuration["Jwt:Issuer"] ?? "ManageIT";
var jwtAudience = builder.Configuration["Jwt:Audience"] ?? "ManageIT";

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(o =>
    {
        o.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = jwtIssuer,
            ValidAudience = jwtAudience,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSecret))
        };
    });
builder.Services.AddAuthorization();

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new OpenApiInfo
    {
        Title = "ManageIT API",
        Version = "v1",
        Description = "ERP REST API for inventory and job management"
    });
    c.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Name = "Authorization",
        Type = SecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT",
        In = ParameterLocation.Header,
        Description = "JWT from POST /api/auth/login"
    });
    c.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        {
            new OpenApiSecurityScheme
            {
                Reference = new OpenApiReference { Type = ReferenceType.SecurityScheme, Id = "Bearer" }
            },
            Array.Empty<string>()
        }
    });
});

var corsOrigins = builder.Configuration.GetSection("Cors:Origins").Get<string[]>() ?? ["*"];
builder.Services.AddCors(o => o.AddDefaultPolicy(p =>
    p.WithOrigins(corsOrigins).AllowAnyHeader().AllowAnyMethod()));

var app = builder.Build();

app.UseSwagger();
app.UseSwaggerUI(c => c.SwaggerEndpoint("/swagger/v1/swagger.json", "ManageIT API v1"));

app.UseCors();
app.UseAuthentication();
app.UseAuthorization();

var frontendPath = Path.GetFullPath(Path.Combine(app.Environment.ContentRootPath, "..", "..", "frontend", "public"));
if (Directory.Exists(frontendPath))
{
    app.UseDefaultFiles(new DefaultFilesOptions { FileProvider = new Microsoft.Extensions.FileProviders.PhysicalFileProvider(frontendPath) });
    app.UseStaticFiles(new StaticFileOptions { FileProvider = new Microsoft.Extensions.FileProviders.PhysicalFileProvider(frontendPath) });
}

var lmsPath = new[]
    {
        Path.Combine(app.Environment.ContentRootPath, "..", "..", "lms", "renderer"),
        Path.Combine(app.Environment.ContentRootPath, "lms", "renderer")
    }
    .Select(Path.GetFullPath)
    .FirstOrDefault(Directory.Exists);
if (lmsPath is not null)
{
    var lmsFiles = new Microsoft.Extensions.FileProviders.PhysicalFileProvider(lmsPath);
    var webmanifest = new Microsoft.AspNetCore.StaticFiles.FileExtensionContentTypeProvider();
    webmanifest.Mappings[".webmanifest"] = "application/manifest+json";
    app.UseStaticFiles(new StaticFileOptions { FileProvider = lmsFiles, RequestPath = "/lms", ContentTypeProvider = webmanifest });
}

app.MapGet("/api/health", async (ManageItDataService db) =>
{
    var (ok, err) = await db.TestConnectionAsync();
    return Results.Ok(new HealthResponse
    {
        Status = ok ? "ok" : "degraded",
        DatabaseConnected = ok,
        DatabaseError = err
    });
})
.WithName("HealthCheck")
.WithTags("System");

app.MapPost("/api/auth/login", async (LoginRequest request, ManageItDataService db, JwtTokenService jwt, PermissionService perms) =>
{
    try
    {
        var result = await db.LoginAsync(request);
        if (!result.Success)
            return Results.Json(result, statusCode: 401);

        result.Token = jwt.CreateToken(result.User!);
        result.Permissions = new Dictionary<string, string>(perms.GetPermissionsForRole(result.User!.Role));
        result.RoleDisplayName = perms.GetRoleDisplayName(result.User.Role);
        return Results.Ok(result);
    }
    catch (Exception ex)
    {
        return Results.Problem(detail: ex.Message, title: "Login failed");
    }
})
.WithName("Login")
.WithTags("Auth");

// Public: used on the login page to show/hide the LMS tab for a SAL number (no password).
app.MapGet("/api/auth/lms-access", async (string? sal, ManageItDataService db) =>
{
    try
    {
        var can = !string.IsNullOrWhiteSpace(sal) && await db.CanAccessLmsAsync(sal);
        return Results.Ok(new LmsAccessResponse { CanAccessLms = can });
    }
    catch
    {
        return Results.Ok(new LmsAccessResponse { CanAccessLms = false });
    }
})
.WithName("CheckLmsAccess")
.WithTags("Auth");

app.MapGet("/api/auth/me", async (ClaimsPrincipal user, ManageItDataService db, PermissionService perms) =>
{
    var idClaim = user.FindFirstValue(ClaimTypes.NameIdentifier);
    if (!int.TryParse(idClaim, out var userId))
        return Results.Unauthorized();

    var profile = await db.GetUserByIdAsync(userId);
    if (profile is null) return Results.NotFound();
    return Results.Ok(new
    {
        user = profile,
        permissions = perms.GetPermissionsForRole(profile.Role),
        roleDisplayName = perms.GetRoleDisplayName(profile.Role)
    });
})
.RequireAuthorization()
.WithName("GetCurrentUser")
.WithTags("Auth");

app.MapGet("/api/auth/permissions", (ClaimsPrincipal user, PermissionService perms) =>
{
    var role = PermissionAuthorization.GetRole(user);
    return Results.Ok(new
    {
        role,
        roleDisplayName = perms.GetRoleDisplayName(role),
        permissions = perms.GetPermissionsForRole(role)
    });
})
.RequireAuthorization()
.WithName("GetPermissions")
.WithTags("Auth");

app.MapGet("/api/roles", (PermissionService perms) =>
{
    var roles = new[]
    {
        new { code = "admin", name = "Admin", description = "System setup, user management, security, all permissions" },
        new { code = "stockCapturer", name = "Stock Capturer", description = "Capture receipts, issues, transfers, create new stock" },
        new { code = "approver", name = "Approver", description = "Authorize transactions, adjustments, transfers, stock takes" },
        new { code = "storeManager", name = "Store Manager", description = "Warehouse operations, oversee movement, monitor inventory" },
        new { code = "auditor", name = "Auditor", description = "Verify counts, audits, review history, authorize audit adjustments" },
        new { code = "viewer", name = "Viewer", description = "Read-only inventory and reports" }
    };
    return Results.Ok(roles);
})
.RequireAuthorization()
.WithName("ListRoles")
.WithTags("Auth");

app.MapGet("/api/users", async (ClaimsPrincipal user, ManageItDataService db, PermissionService perms) =>
{
    if (PermissionAuthorization.IsDenied(perms, user, PermissionCodes.UserManagement, PermissionLevels.View, out var denied))
        return denied;
    try
    {
        var users = await db.GetUsersAsync();
        return Results.Ok(users);
    }
    catch (Exception ex)
    {
        return Results.Problem(detail: ex.Message, title: "Failed to load users");
    }
})
.RequireAuthorization()
.WithName("ListUsers")
.WithTags("Users");

app.MapGet("/api/users/{id:int}", async (int id, ManageItDataService db) =>
{
    try
    {
        var user = await db.GetUserByIdAsync(id);
        return user is null ? Results.NotFound(new { error = "User not found" }) : Results.Ok(user);
    }
    catch (Exception ex)
    {
        return Results.Problem(detail: ex.Message, title: "Failed to load user");
    }
})
.RequireAuthorization()
.WithName("GetUser")
.WithTags("Users");

app.MapPost("/api/users", async (ClaimsPrincipal user, UserDto userDto, ManageItDataService db, PermissionService perms) =>
{
    if (PermissionAuthorization.IsDenied(perms, user, PermissionCodes.UserManagement, PermissionLevels.CreateEdit, out var denied))
        return denied;
    try
    {
        var (created, error, statusCode) = await db.CreateUserAsync(userDto);
        if (created is null)
            return Results.Json(new { error }, statusCode: statusCode);
        return Results.Json(created, statusCode: statusCode);
    }
    catch (Exception ex)
    {
        return Results.Problem(detail: ex.Message, title: "Failed to create user");
    }
})
.RequireAuthorization()
.WithName("CreateUser")
.WithTags("Users");

app.MapPut("/api/users/{id:int}", async (ClaimsPrincipal user, int id, UserDto userDto, ManageItDataService db, PermissionService perms) =>
{
    if (PermissionAuthorization.IsDenied(perms, user, PermissionCodes.UserManagement, PermissionLevels.CreateEdit, out var denied))
        return denied;
    try
    {
        var (updated, error, statusCode) = await db.UpdateUserAsync(id, userDto);
        if (updated is null)
            return Results.Json(new { error }, statusCode: statusCode);
        return Results.Ok(updated);
    }
    catch (Exception ex)
    {
        return Results.Problem(detail: ex.Message, title: "Failed to update user");
    }
})
.RequireAuthorization()
.WithName("UpdateUser")
.WithTags("Users");

app.MapDelete("/api/users/{id:int}", async (ClaimsPrincipal user, int id, ManageItDataService db, PermissionService perms) =>
{
    if (PermissionAuthorization.IsDenied(perms, user, PermissionCodes.UserManagement, PermissionLevels.Full, out var denied))
        return denied;
    try
    {
        var (deleted, error, statusCode) = await db.DeleteUserAsync(id);
        if (!deleted)
            return Results.Json(new { error }, statusCode: statusCode);
        return Results.Ok(new { ok = true });
    }
    catch (Exception ex)
    {
        return Results.Problem(detail: ex.Message, title: "Failed to delete user");
    }
})
.RequireAuthorization()
.WithName("DeleteUser")
.WithTags("Users");

app.MapGet("/api/bootstrap", async (ManageItDataService db) =>
{
    try
    {
        var state = await db.LoadStateAsync();
        return Results.Ok(state);
    }
    catch (Exception ex)
    {
        return Results.Problem(detail: ex.Message, title: "Failed to load data from SQL Server");
    }
})
.RequireAuthorization()
.WithName("Bootstrap")
.WithTags("Data");

app.MapPost("/api/sync", async (AppStateDto state, ManageItDataService db) =>
{
    try
    {
        await db.SaveStateAsync(state);
        return Results.Ok(new { success = true });
    }
    catch (Exception ex)
    {
        return Results.Problem(detail: ex.Message, title: "Failed to save data to SQL Server");
    }
})
.RequireAuthorization()
.WithName("Sync")
.WithTags("Data");

app.MapGet("/api/jobs", async (ManageItDataService db) =>
{
    try
    {
        var jobs = await db.GetJobsAsync();
        return Results.Ok(jobs);
    }
    catch (Exception ex)
    {
        return Results.Problem(detail: ex.Message, title: "Failed to load jobs");
    }
})
.RequireAuthorization()
.WithName("ListJobs")
.WithTags("Jobs");

app.MapGet("/api/jobs/{id:int}", async (int id, ManageItDataService db) =>
{
    try
    {
        var job = await db.GetJobByIdAsync(id);
        return job is null ? Results.NotFound(new { error = "Job not found" }) : Results.Ok(job);
    }
    catch (Exception ex)
    {
        return Results.Problem(detail: ex.Message, title: "Failed to load job");
    }
})
.RequireAuthorization()
.WithName("GetJob")
.WithTags("Jobs");

app.MapPost("/api/jobs", async (JobDto job, ManageItDataService db) =>
{
    try
    {
        var (created, error, statusCode) = await db.CreateJobAsync(job);
        if (created is null)
            return Results.Json(new { error }, statusCode: statusCode);
        return Results.Json(created, statusCode: statusCode);
    }
    catch (Exception ex)
    {
        return Results.Problem(detail: ex.Message, title: "Failed to create job");
    }
})
.RequireAuthorization()
.WithName("CreateJob")
.WithTags("Jobs");

app.MapPut("/api/jobs/{id:int}", async (int id, JobDto job, ManageItDataService db) =>
{
    try
    {
        var (updated, error, statusCode) = await db.UpdateJobAsync(id, job);
        if (updated is null)
            return Results.Json(new { error }, statusCode: statusCode);
        return Results.Ok(updated);
    }
    catch (Exception ex)
    {
        return Results.Problem(detail: ex.Message, title: "Failed to update job");
    }
})
.RequireAuthorization()
.WithName("UpdateJob")
.WithTags("Jobs");

app.MapDelete("/api/jobs/{id:int}", async (int id, ManageItDataService db) =>
{
    try
    {
        var (deleted, error, statusCode) = await db.DeleteJobAsync(id);
        if (!deleted)
            return Results.Json(new { error }, statusCode: statusCode);
        return Results.Ok(new { ok = true });
    }
    catch (Exception ex)
    {
        return Results.Problem(detail: ex.Message, title: "Failed to delete job");
    }
})
.RequireAuthorization()
.WithName("DeleteJob")
.WithTags("Jobs");

app.MapGet("/api/stock", async (ManageItDataService db) =>
{
    try
    {
        var stock = await db.GetStockAsync();
        return Results.Ok(stock);
    }
    catch (Exception ex)
    {
        return Results.Problem(detail: ex.Message, title: "Failed to load stock");
    }
})
.RequireAuthorization()
.WithName("ListStock")
.WithTags("Stock");

app.MapGet("/api/stock/{id:int}", async (int id, ManageItDataService db) =>
{
    try
    {
        var item = await db.GetStockByIdAsync(id);
        return item is null ? Results.NotFound(new { error = "Stock item not found" }) : Results.Ok(item);
    }
    catch (Exception ex)
    {
        return Results.Problem(detail: ex.Message, title: "Failed to load stock item");
    }
})
.RequireAuthorization()
.WithName("GetStock")
.WithTags("Stock");

app.MapPost("/api/stock", async (ClaimsPrincipal user, StockDto stock, ManageItDataService db, PermissionService perms) =>
{
    if (PermissionAuthorization.IsDenied(perms, user, PermissionCodes.StockNumber, PermissionLevels.CreateEdit, out var denied))
        return denied;
    try
    {
        var (created, error, statusCode) = await db.CreateStockAsync(stock);
        if (created is null)
            return Results.Json(new { error }, statusCode: statusCode);
        return Results.Json(created, statusCode: statusCode);
    }
    catch (Exception ex)
    {
        return Results.Problem(detail: ex.Message, title: "Failed to create stock item");
    }
})
.RequireAuthorization()
.WithName("CreateStock")
.WithTags("Stock");

app.MapPut("/api/stock/{id:int}", async (ClaimsPrincipal user, int id, StockDto stock, ManageItDataService db, PermissionService perms) =>
{
    if (PermissionAuthorization.IsDenied(perms, user, PermissionCodes.StockNumber, PermissionLevels.CreateEdit, out var denied))
        return denied;
    try
    {
        var (updated, error, statusCode) = await db.UpdateStockAsync(id, stock);
        if (updated is null)
            return Results.Json(new { error }, statusCode: statusCode);
        return Results.Ok(updated);
    }
    catch (Exception ex)
    {
        return Results.Problem(detail: ex.Message, title: "Failed to update stock item");
    }
})
.RequireAuthorization()
.WithName("UpdateStock")
.WithTags("Stock");

app.MapDelete("/api/stock/{id:int}", async (ClaimsPrincipal user, int id, ManageItDataService db, PermissionService perms) =>
{
    if (PermissionAuthorization.IsDenied(perms, user, PermissionCodes.StockNumber, PermissionLevels.Full, out var denied))
        return denied;
    try
    {
        var (deleted, error, statusCode) = await db.DeleteStockAsync(id);
        if (!deleted)
            return Results.Json(new { error }, statusCode: statusCode);
        return Results.Ok(new { ok = true });
    }
    catch (Exception ex)
    {
        return Results.Problem(detail: ex.Message, title: "Failed to delete stock item");
    }
})
.RequireAuthorization()
.WithName("DeleteStock")
.WithTags("Stock");

static int? GetUserId(ClaimsPrincipal user)
{
    var idClaim = user.FindFirstValue(ClaimTypes.NameIdentifier);
    return int.TryParse(idClaim, out var userId) ? userId : null;
}

app.MapGet("/api/storage-locations", async (ManageItDataService db) =>
{
    try { return Results.Ok(await db.GetStorageLocationsAsync()); }
    catch (Exception ex) { return Results.Problem(detail: ex.Message, title: "Failed to load storage locations"); }
})
.RequireAuthorization().WithName("ListStorageLocations").WithTags("StorageLocations");

app.MapGet("/api/storage-locations/{id:int}", async (int id, ManageItDataService db) =>
{
    try
    {
        var loc = await db.GetStorageLocationByIdAsync(id);
        return loc is null ? Results.NotFound(new { error = "Location not found" }) : Results.Ok(loc);
    }
    catch (Exception ex) { return Results.Problem(detail: ex.Message, title: "Failed to load storage location"); }
})
.RequireAuthorization().WithName("GetStorageLocation").WithTags("StorageLocations");

app.MapPost("/api/storage-locations", async (StorageLocationDto loc, ManageItDataService db) =>
{
    try
    {
        var (created, error, statusCode) = await db.CreateStorageLocationAsync(loc);
        if (created is null) return Results.Json(new { error }, statusCode: statusCode);
        return Results.Json(created, statusCode: statusCode);
    }
    catch (Exception ex) { return Results.Problem(detail: ex.Message, title: "Failed to create storage location"); }
})
.RequireAuthorization().WithName("CreateStorageLocation").WithTags("StorageLocations");

app.MapPut("/api/storage-locations/{id:int}", async (int id, StorageLocationDto loc, ManageItDataService db) =>
{
    try
    {
        var (updated, error, statusCode) = await db.UpdateStorageLocationAsync(id, loc);
        if (updated is null) return Results.Json(new { error }, statusCode: statusCode);
        return Results.Ok(updated);
    }
    catch (Exception ex) { return Results.Problem(detail: ex.Message, title: "Failed to update storage location"); }
})
.RequireAuthorization().WithName("UpdateStorageLocation").WithTags("StorageLocations");

app.MapDelete("/api/storage-locations/{id:int}", async (int id, ManageItDataService db) =>
{
    try
    {
        var (deleted, error, statusCode) = await db.DeleteStorageLocationAsync(id);
        if (!deleted) return Results.Json(new { error }, statusCode: statusCode);
        return Results.Ok(new { ok = true });
    }
    catch (Exception ex) { return Results.Problem(detail: ex.Message, title: "Failed to delete storage location"); }
})
.RequireAuthorization().WithName("DeleteStorageLocation").WithTags("StorageLocations");

app.MapGet("/api/assets", async (ManageItDataService db) =>
{
    try { return Results.Ok(await db.GetAssetsAsync()); }
    catch (Exception ex) { return Results.Problem(detail: ex.Message, title: "Failed to load assets"); }
})
.RequireAuthorization().WithName("ListAssets").WithTags("Assets");

app.MapGet("/api/assets/{id:int}", async (int id, ManageItDataService db) =>
{
    try
    {
        var asset = await db.GetAssetByIdAsync(id);
        return asset is null ? Results.NotFound(new { error = "Asset not found" }) : Results.Ok(asset);
    }
    catch (Exception ex) { return Results.Problem(detail: ex.Message, title: "Failed to load asset"); }
})
.RequireAuthorization().WithName("GetAsset").WithTags("Assets");

app.MapPost("/api/assets", async (ClaimsPrincipal user, AssetDto asset, ManageItDataService db, PermissionService perms) =>
{
    if (PermissionAuthorization.IsDenied(perms, user, PermissionCodes.AssetManagement, PermissionLevels.CreateEdit, out var denied))
        return denied;
    try
    {
        var (created, error, statusCode) = await db.CreateAssetAsync(asset);
        if (created is null) return Results.Json(new { error }, statusCode: statusCode);
        return Results.Json(created, statusCode: statusCode);
    }
    catch (Exception ex) { return Results.Problem(detail: ex.Message, title: "Failed to create asset"); }
})
.RequireAuthorization().WithName("CreateAsset").WithTags("Assets");

app.MapPut("/api/assets/{id:int}", async (ClaimsPrincipal user, int id, AssetDto asset, ManageItDataService db, PermissionService perms) =>
{
    if (PermissionAuthorization.IsDenied(perms, user, PermissionCodes.AssetManagement, PermissionLevels.CreateEdit, out var denied))
        return denied;
    try
    {
        var (updated, error, statusCode) = await db.UpdateAssetAsync(id, asset);
        if (updated is null) return Results.Json(new { error }, statusCode: statusCode);
        return Results.Json(updated, statusCode: statusCode);
    }
    catch (Exception ex) { return Results.Problem(detail: ex.Message, title: "Failed to update asset"); }
})
.RequireAuthorization().WithName("UpdateAsset").WithTags("Assets");

app.MapDelete("/api/assets/{id:int}", async (ClaimsPrincipal user, int id, ManageItDataService db, PermissionService perms) =>
{
    if (PermissionAuthorization.IsDenied(perms, user, PermissionCodes.AssetManagement, PermissionLevels.Full, out var denied))
        return denied;
    try
    {
        var (deleted, error, statusCode) = await db.DeleteAssetAsync(id);
        if (!deleted) return Results.Json(new { error }, statusCode: statusCode);
        return Results.Ok(new { ok = true });
    }
    catch (Exception ex) { return Results.Problem(detail: ex.Message, title: "Failed to delete asset"); }
})
.RequireAuthorization().WithName("DeleteAsset").WithTags("Assets");

app.MapGet("/api/asset-maintenance", async (ManageItDataService db) =>
{
    try { return Results.Ok(await db.GetAssetMaintenanceAsync()); }
    catch (Exception ex) { return Results.Problem(detail: ex.Message, title: "Failed to load asset maintenance"); }
})
.RequireAuthorization().WithName("ListAssetMaintenance").WithTags("Assets");

app.MapPost("/api/asset-maintenance", async (ClaimsPrincipal user, AssetMaintenanceDto item, ManageItDataService db, PermissionService perms) =>
{
    if (PermissionAuthorization.IsDenied(perms, user, PermissionCodes.AssetManagement, PermissionLevels.CreateEdit, out var denied))
        return denied;
    try
    {
        var (created, error, statusCode) = await db.CreateAssetMaintenanceAsync(item);
        if (created is null) return Results.Json(new { error }, statusCode: statusCode);
        return Results.Json(created, statusCode: statusCode);
    }
    catch (Exception ex) { return Results.Problem(detail: ex.Message, title: "Failed to create maintenance record"); }
})
.RequireAuthorization().WithName("CreateAssetMaintenance").WithTags("Assets");

app.MapPut("/api/asset-maintenance/{id:int}", async (ClaimsPrincipal user, int id, AssetMaintenanceDto item, ManageItDataService db, PermissionService perms) =>
{
    if (PermissionAuthorization.IsDenied(perms, user, PermissionCodes.AssetManagement, PermissionLevels.CreateEdit, out var denied))
        return denied;
    try
    {
        var (updated, error, statusCode) = await db.UpdateAssetMaintenanceAsync(id, item);
        if (updated is null) return Results.Json(new { error }, statusCode: statusCode);
        return Results.Json(updated, statusCode: statusCode);
    }
    catch (Exception ex) { return Results.Problem(detail: ex.Message, title: "Failed to update maintenance record"); }
})
.RequireAuthorization().WithName("UpdateAssetMaintenance").WithTags("Assets");

app.MapDelete("/api/asset-maintenance/{id:int}", async (ClaimsPrincipal user, int id, ManageItDataService db, PermissionService perms) =>
{
    if (PermissionAuthorization.IsDenied(perms, user, PermissionCodes.AssetManagement, PermissionLevels.Full, out var denied))
        return denied;
    try
    {
        var (deleted, error, statusCode) = await db.DeleteAssetMaintenanceAsync(id);
        if (!deleted) return Results.Json(new { error }, statusCode: statusCode);
        return Results.Ok(new { ok = true });
    }
    catch (Exception ex) { return Results.Problem(detail: ex.Message, title: "Failed to delete maintenance record"); }
})
.RequireAuthorization().WithName("DeleteAssetMaintenance").WithTags("Assets");

app.MapGet("/api/transactions", async (ManageItDataService db) =>
{
    try { return Results.Ok(await db.GetTransactionsAsync()); }
    catch (Exception ex) { return Results.Problem(detail: ex.Message, title: "Failed to load transactions"); }
})
.RequireAuthorization().WithName("ListTransactions").WithTags("Transactions");

app.MapPost("/api/transactions", async (ClaimsPrincipal user, TransactionDto tx, ManageItDataService db) =>
{
    try
    {
        var userId = GetUserId(user) ?? 1;
        var (created, error, statusCode) = await db.CreateTransactionAsync(tx, userId);
        if (created is null) return Results.Json(new { error }, statusCode: statusCode);
        return Results.Json(created, statusCode: statusCode);
    }
    catch (Exception ex) { return Results.Problem(detail: ex.Message, title: "Failed to create transaction"); }
})
.RequireAuthorization().WithName("CreateTransaction").WithTags("Transactions");

app.MapGet("/api/activity", async (ManageItDataService db) =>
{
    try { return Results.Ok(await db.GetActivityAsync()); }
    catch (Exception ex) { return Results.Problem(detail: ex.Message, title: "Failed to load activity"); }
})
.RequireAuthorization().WithName("ListActivity").WithTags("Activity");

app.MapPost("/api/activity", async (ClaimsPrincipal user, ActivityDto activity, ManageItDataService db) =>
{
    try
    {
        var (created, error, statusCode) = await db.CreateActivityAsync(activity, GetUserId(user));
        if (created is null) return Results.Json(new { error }, statusCode: statusCode);
        return Results.Json(created, statusCode: statusCode);
    }
    catch (Exception ex) { return Results.Problem(detail: ex.Message, title: "Failed to log activity"); }
})
.RequireAuthorization().WithName("CreateActivity").WithTags("Activity");

app.MapGet("/api/settings", async (ManageItDataService db) =>
{
    try { return Results.Ok(await db.GetSettingsAsync()); }
    catch (Exception ex) { return Results.Problem(detail: ex.Message, title: "Failed to load settings"); }
})
.RequireAuthorization().WithName("GetSettings").WithTags("Settings");

app.MapPut("/api/settings", async (Dictionary<string, object?> settings, ManageItDataService db, PermissionService perms, ClaimsPrincipal user) =>
{
    if (PermissionAuthorization.IsDenied(perms, user, PermissionCodes.SystemSettings, PermissionLevels.CreateEdit, out var denied))
        return denied;
    try { return Results.Ok(await db.UpdateSettingsAsync(settings)); }
    catch (Exception ex) { return Results.Problem(detail: ex.Message, title: "Failed to save settings"); }
})
.RequireAuthorization().WithName("UpdateSettings").WithTags("Settings");

app.MapGet("/api/audits", async (ManageItDataService db) =>
{
    try { return Results.Ok(await db.GetAuditsAsync()); }
    catch (Exception ex) { return Results.Problem(detail: ex.Message, title: "Failed to load audits"); }
})
.RequireAuthorization().WithName("ListAudits").WithTags("Audits");

app.MapPost("/api/audits", async (AuditDto audit, ManageItDataService db) =>
{
    try
    {
        var (created, error, statusCode) = await db.CreateAuditAsync(audit);
        if (created is null) return Results.Json(new { error }, statusCode: statusCode);
        return Results.Json(created, statusCode: statusCode);
    }
    catch (Exception ex) { return Results.Problem(detail: ex.Message, title: "Failed to create audit"); }
})
.RequireAuthorization().WithName("CreateAudit").WithTags("Audits");

app.MapGet("/api/reconciliations", async (ManageItDataService db) =>
{
    try { return Results.Ok(await db.GetReconciliationsAsync()); }
    catch (Exception ex) { return Results.Problem(detail: ex.Message, title: "Failed to load reconciliations"); }
})
.RequireAuthorization().WithName("ListReconciliations").WithTags("Reconciliations");

app.MapPost("/api/reconciliations", async (ReconciliationDto item, ManageItDataService db) =>
{
    try
    {
        var (created, error, statusCode) = await db.CreateReconciliationAsync(item);
        if (created is null) return Results.Json(new { error }, statusCode: statusCode);
        return Results.Json(created, statusCode: statusCode);
    }
    catch (Exception ex) { return Results.Problem(detail: ex.Message, title: "Failed to create reconciliation"); }
})
.RequireAuthorization().WithName("CreateReconciliation").WithTags("Reconciliations");

// ── Multi-count audit workflow (Stock-IT portal) ──────────────────────

app.MapGet("/api/audit-sessions", async (ManageItDataService db) =>
{
    try { return Results.Ok(await db.GetAuditSessionsAsync()); }
    catch (Exception ex) { return Results.Problem(detail: ex.Message, title: "Failed to load audit sessions"); }
})
.RequireAuthorization().WithName("ListAuditSessions").WithTags("Inventory Audit");

app.MapPost("/api/audit-sessions", async (ClaimsPrincipal user, AuditSessionDto session, ManageItDataService db, PermissionService perms) =>
{
    if (PermissionAuthorization.IsDenied(perms, user, PermissionCodes.StockTake, PermissionLevels.CreateEdit, out var denied))
        return denied;
    try
    {
        var (saved, error, statusCode) = await db.UpsertAuditSessionAsync(session);
        if (saved is null) return Results.Json(new { error }, statusCode: statusCode);
        return Results.Json(saved, statusCode: statusCode);
    }
    catch (Exception ex) { return Results.Problem(detail: ex.Message, title: "Failed to save audit session"); }
})
.RequireAuthorization().WithName("UpsertAuditSession").WithTags("Inventory Audit");

app.MapDelete("/api/audit-sessions/{id}", async (ClaimsPrincipal user, string id, ManageItDataService db, PermissionService perms) =>
{
    if (PermissionAuthorization.IsDenied(perms, user, PermissionCodes.StockTake, PermissionLevels.Full, out var denied))
        return denied;
    try
    {
        var (ok, error, statusCode) = await db.DeleteAuditSessionAsync(id);
        if (!ok) return Results.Json(new { error }, statusCode: statusCode);
        return Results.NoContent();
    }
    catch (Exception ex) { return Results.Problem(detail: ex.Message, title: "Failed to delete audit session"); }
})
.RequireAuthorization().WithName("DeleteAuditSession").WithTags("Inventory Audit");

app.MapGet("/api/recon-history", async (ManageItDataService db) =>
{
    try { return Results.Ok(await db.GetReconHistoryAsync()); }
    catch (Exception ex) { return Results.Problem(detail: ex.Message, title: "Failed to load recon history"); }
})
.RequireAuthorization().WithName("ListReconHistory").WithTags("Inventory Reconciliation");

app.MapPost("/api/recon-history", async (ClaimsPrincipal user, ReconReportDto run, ManageItDataService db, PermissionService perms) =>
{
    if (PermissionAuthorization.IsDenied(perms, user, PermissionCodes.StockAdjustments, PermissionLevels.CreateEdit, out var denied))
        return denied;
    try
    {
        var (saved, error, statusCode) = await db.UpsertReconHistoryRunAsync(run);
        if (saved is null) return Results.Json(new { error }, statusCode: statusCode);
        return Results.Json(saved, statusCode: statusCode);
    }
    catch (Exception ex) { return Results.Problem(detail: ex.Message, title: "Failed to save recon history"); }
})
.RequireAuthorization().WithName("UpsertReconHistory").WithTags("Inventory Reconciliation");

app.MapGet("/api/serial-numbers", async (ManageItDataService db) =>
{
    try { return Results.Ok(await db.GetSerialNumbersAsync()); }
    catch (Exception ex) { return Results.Problem(detail: ex.Message, title: "Failed to load serial numbers"); }
})
.RequireAuthorization().WithName("ListSerialNumbers").WithTags("Inventory Transactions");

app.MapPost("/api/serial-numbers", async (ClaimsPrincipal user, SerialNumberRequest body, ManageItDataService db, PermissionService perms) =>
{
    if (PermissionAuthorization.IsDenied(perms, user, PermissionCodes.StockReceiving, PermissionLevels.CreateEdit, out var denied))
        return denied;
    try
    {
        var (sn, error, statusCode) = await db.AddSerialNumberAsync(body.SerialNumber);
        if (sn is null) return Results.Json(new { error }, statusCode: statusCode);
        return Results.Json(new { serialNumber = sn }, statusCode: statusCode);
    }
    catch (Exception ex) { return Results.Problem(detail: ex.Message, title: "Failed to add serial number"); }
})
.RequireAuthorization().WithName("AddSerialNumber").WithTags("Inventory Transactions");

app.MapFallback(async context =>
{
    var isLms = lmsPath is not null && context.Request.Path.StartsWithSegments("/lms");
    if (isLms && context.Request.Path.Value!.TrimEnd('/') == "/lms" && !context.Request.Path.Value.EndsWith('/'))
    {
        context.Response.Redirect("/lms/");
        return;
    }
    var index = Path.Combine(isLms ? lmsPath! : frontendPath, "index.html");
    if (File.Exists(index))
    {
        context.Response.ContentType = "text/html";
        await context.Response.SendFileAsync(index);
        return;
    }
    context.Response.StatusCode = 404;
    await context.Response.WriteAsync("ManageIT API is running. Frontend files not found.");
});

app.Run();
