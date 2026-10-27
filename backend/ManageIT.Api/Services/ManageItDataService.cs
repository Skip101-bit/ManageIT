using System.Data;
using System.Text.Json;
using ManageIT.Api.Models;
using Microsoft.Data.SqlClient;

namespace ManageIT.Api.Services;

public sealed partial class ManageItDataService
{
    private readonly string _connectionString;
    private readonly ILogger<ManageItDataService> _logger;

    public ManageItDataService(IConfiguration config, ILogger<ManageItDataService> logger)
    {
        _connectionString = config.GetConnectionString("ManageIT")
            ?? throw new InvalidOperationException("Connection string 'ManageIT' is not configured.");
        _logger = logger;
    }

    public async Task<(bool Ok, string? Error)> TestConnectionAsync(CancellationToken ct = default)
    {
        try
        {
            await using var conn = new SqlConnection(_connectionString);
            await conn.OpenAsync(ct);
            return (true, null);
        }
        catch (Exception ex)
        {
            return (false, ex.Message);
        }
    }

    public async Task<AppStateDto> LoadStateAsync(CancellationToken ct = default)
    {
        await TryEnsureEngineeringTableAsync(ct);
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync(ct);

        var users = await LoadUsersAsync(conn, ct);
        var locations = await LoadStorageLocationsAsync(conn, ct);
        var jobs = await LoadJobsAsync(conn, ct);
        var stock = await LoadStockAsync(conn, jobs, locations, ct);
        var transactions = await LoadTransactionsAsync(conn, stock, users, jobs, locations, ct);
        var activity = await LoadActivityAsync(conn, users, ct);
        var settings = await LoadSettingsAsync(conn, ct);
        var audits = await LoadAuditsAsync(conn, ct);
        var reconciliations = await LoadReconciliationsAsync(conn, ct);
        var pendingApprovals = await LoadPendingApprovalsAsync(conn, ct);
        var auditSessions = await LoadAuditSessionsAsync(conn, ct);
        var reconHistory = await LoadReconHistoryAsync(conn, ct);
        var serialNumbers = await LoadSerialNumbersAsync(conn, ct);
        var assets = await LoadAssetsAsync(conn, ct);
        var assetMaintenance = await LoadAssetMaintenanceAsync(conn, ct);
        var engineering = await LoadEngineeringAsync(conn, ct);

        return new AppStateDto
        {
            Users = users,
            Jobs = jobs,
            Stock = stock,
            Activity = activity,
            Transactions = transactions,
            StorageLocations = locations,
            Audits = audits,
            Reconciliations = reconciliations,
            PendingApprovals = pendingApprovals,
            AuditSessions = auditSessions,
            ReconHistory = reconHistory,
            SerialNumbers = serialNumbers,
            Assets = assets,
            AssetMaintenance = assetMaintenance,
            BomLines = engineering?.BomLines,
            PastelTimeline = engineering?.PastelTimeline,
            PastelChecks = engineering?.PastelChecks,
            PastelUpdates = engineering?.PastelUpdates,
            JobCardLines = engineering?.JobCardLines,
            StockChecks = engineering?.StockChecks,
            BomHistory = engineering?.BomHistory,
            Settings = settings
        };
    }

    public async Task SaveStateAsync(AppStateDto state, CancellationToken ct = default)
    {
        await TryEnsureEngineeringTableAsync(ct);
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync(ct);
        await using var tx = (SqlTransaction)await conn.BeginTransactionAsync(ct);

        try
        {
            await SyncUsersAsync(conn, tx, state.Users, ct);
            await SyncStorageLocationsAsync(conn, tx, state.StorageLocations, ct);
            await SyncJobsAsync(conn, tx, state.Jobs, ct);
            await SyncStockAsync(conn, tx, state.Stock, state.Jobs, state.StorageLocations, ct);
            await SyncTransactionsAsync(conn, tx, state.Transactions, state.Stock, state.Users, state.Jobs, state.StorageLocations, ct);
            await SyncActivityAsync(conn, tx, state.Activity, state.Users, ct);
            await SyncSettingsAsync(conn, tx, state.Settings, ct);
            await SyncAuditsAsync(conn, tx, state.Audits, ct);
            await SyncReconciliationsAsync(conn, tx, state.Reconciliations, ct);
            await SyncPendingApprovalsAsync(conn, tx, state.PendingApprovals, ct);
            await SyncAuditSessionsAsync(conn, tx, state.AuditSessions, ct);
            await SyncReconHistoryAsync(conn, tx, state.ReconHistory, ct);
            await SyncSerialNumbersAsync(conn, tx, state.SerialNumbers, ct);
            await SyncAssetsAsync(conn, tx, state.Assets, ct);
            await SyncAssetMaintenanceAsync(conn, tx, state.AssetMaintenance, ct);
            await SyncEngineeringAsync(conn, tx, state, ct);

            await tx.CommitAsync(ct);
        }
        catch
        {
            await tx.RollbackAsync(ct);
            throw;
        }
    }

    public async Task<LoginResponse> LoginAsync(LoginRequest request, CancellationToken ct = default)
    {
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync(ct);

        await using var cmd = new SqlCommand("dbo.usp_User_GetBySALNumber", conn)
        {
            CommandType = CommandType.StoredProcedure
        };
        cmd.Parameters.AddWithValue("@SALNumber", request.SalNumber.Trim().Replace(" ", string.Empty));

        await using var reader = await cmd.ExecuteReaderAsync(ct);
        if (!await reader.ReadAsync(ct))
            return new LoginResponse { Success = false, Message = "SAL number not found. Please try again." };

        var status = MapUserStatus(reader.GetString(reader.GetOrdinal("Status")));
        if (status is "Inactive" or "Blocked")
            return new LoginResponse { Success = false, Message = "This account is inactive. Contact your administrator." };

        var hash = reader.GetString(reader.GetOrdinal("PasswordHash"));
        if (!VerifyPassword(request.Password, hash))
            return new LoginResponse { Success = false, Message = "Incorrect password. Please try again." };

        var userId = reader.GetInt32(reader.GetOrdinal("UserID"));
        var user = MapUserRow(reader, includePassword: false);

        if (string.Equals(request.Brand, "lms", StringComparison.OrdinalIgnoreCase) && !user.CanAccessLms)
            return new LoginResponse { Success = false, Message = "You do not have access to LMS. Contact your administrator." };

        await reader.CloseAsync();
        await UpdateLastLoginAsync(conn, userId, ct);

        return new LoginResponse { Success = true, User = user };
    }

    public async Task<bool> CanAccessLmsAsync(string salNumber, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(salNumber)) return false;
        var sal = salNumber.Trim().Replace(" ", string.Empty);

        try
        {
            await using var conn = new SqlConnection(_connectionString);
            await conn.OpenAsync(ct);

            try
            {
                await using var cmd = new SqlCommand("dbo.usp_User_CanAccessLms", conn)
                {
                    CommandType = CommandType.StoredProcedure
                };
                cmd.Parameters.AddWithValue("@SALNumber", sal);
                var result = await cmd.ExecuteScalarAsync(ct);
                return result is bool b && b || result is byte by && by == 1 || Convert.ToInt32(result ?? 0) == 1;
            }
            catch
            {
                // Column / proc may not exist yet on older databases.
                const string sql = """
                    SELECT TOP 1 CanAccessLms FROM dbo.Users
                    WHERE SALNumber = @sal AND Status = 'A'
                    """;
                await using var cmd = new SqlCommand(sql, conn);
                cmd.Parameters.AddWithValue("@sal", sal);
                var result = await cmd.ExecuteScalarAsync(ct);
                return result is bool b && b || result is byte by && by == 1 || Convert.ToInt32(result ?? 0) == 1;
            }
        }
        catch
        {
            return false;
        }
    }

    public async Task<UserDto?> GetUserByIdAsync(int userId, CancellationToken ct = default)
    {
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync(ct);

        await using var cmd = new SqlCommand("dbo.usp_User_GetById", conn)
        {
            CommandType = CommandType.StoredProcedure
        };
        cmd.Parameters.AddWithValue("@UserID", userId);

        await using var r = await cmd.ExecuteReaderAsync(ct);
        return await r.ReadAsync(ct) ? MapUserRow(r, includePassword: false) : null;
    }

    private static async Task UpdateLastLoginAsync(SqlConnection conn, int userId, CancellationToken ct)
    {
        await using var cmd = new SqlCommand("dbo.usp_User_UpdateLastLogin", conn)
        {
            CommandType = CommandType.StoredProcedure
        };
        cmd.Parameters.AddWithValue("@UserID", userId);
        await cmd.ExecuteNonQueryAsync(ct);
    }

    public async Task<List<UserDto>> GetUsersAsync(CancellationToken ct = default)
    {
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync(ct);

        await using var cmd = new SqlCommand("dbo.usp_User_GetAll", conn)
        {
            CommandType = CommandType.StoredProcedure
        };

        var list = new List<UserDto>();
        await using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct))
            list.Add(MapUserRow(r, includePassword: false));
        return list;
    }

    public async Task<(UserDto? User, string? Error, int StatusCode)> CreateUserAsync(UserDto user, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(user.SalNumber) || string.IsNullOrWhiteSpace(user.FirstName))
            return (null, "SAL number and name required", 400);
        if (string.IsNullOrWhiteSpace(user.Password))
            return (null, "Password required", 400);

        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync(ct);

        if (await SalNumberExistsAsync(conn, user.SalNumber, null, ct))
            return (null, "SAL number already exists", 409);

        await using var cmd = new SqlCommand("dbo.usp_User_Create", conn)
        {
            CommandType = CommandType.StoredProcedure
        };
        cmd.Parameters.AddWithValue("@SALNumber", user.SalNumber.Trim());
        cmd.Parameters.AddWithValue("@FullName", $"{user.FirstName} {user.LastName}".Trim());
        cmd.Parameters.AddWithValue("@PasswordHash", HashPassword(user.Password));
        cmd.Parameters.AddWithValue("@Role", PermissionService.MapRoleToDb(user.Role));
        cmd.Parameters.AddWithValue("@Status", MapUserStatusToDb(user.Status));
        cmd.Parameters.AddWithValue("@CanAccessLms", user.CanAccessLms);

        await using var r = await cmd.ExecuteReaderAsync(ct);
        if (!await r.ReadAsync(ct)) return (null, "Failed to create user", 500);
        return (MapUserRow(r, includePassword: false), null, 201);
    }

    public async Task<(UserDto? User, string? Error, int StatusCode)> UpdateUserAsync(int id, UserDto user, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(user.SalNumber) || string.IsNullOrWhiteSpace(user.FirstName))
            return (null, "SAL number and name required", 400);

        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync(ct);

        if (await SalNumberExistsAsync(conn, user.SalNumber, id, ct))
            return (null, "SAL number already used", 409);

        var updatePassword = !string.IsNullOrWhiteSpace(user.Password);

        await using var cmd = new SqlCommand("dbo.usp_User_Update", conn)
        {
            CommandType = CommandType.StoredProcedure
        };
        cmd.Parameters.AddWithValue("@UserID", id);
        cmd.Parameters.AddWithValue("@SALNumber", user.SalNumber.Trim());
        cmd.Parameters.AddWithValue("@FullName", $"{user.FirstName} {user.LastName}".Trim());
        cmd.Parameters.AddWithValue("@PasswordHash", updatePassword ? HashPassword(user.Password) : (object)DBNull.Value);
        cmd.Parameters.AddWithValue("@UpdatePassword", updatePassword);
        cmd.Parameters.AddWithValue("@Role", PermissionService.MapRoleToDb(user.Role));
        cmd.Parameters.AddWithValue("@Status", MapUserStatusToDb(user.Status));
        cmd.Parameters.AddWithValue("@CanAccessLms", user.CanAccessLms);

        await using var r = await cmd.ExecuteReaderAsync(ct);
        if (!await r.ReadAsync(ct)) return (null, "User not found", 404);
        return (MapUserRow(r, includePassword: false), null, 200);
    }

    public async Task<(bool Deleted, string? Error, int StatusCode)> DeleteUserAsync(int id, CancellationToken ct = default)
    {
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync(ct);

        if (await GetUserByIdAsync(id, ct) is null)
            return (false, "User not found", 404);

        await using var cmd = new SqlCommand("dbo.usp_User_Delete", conn)
        {
            CommandType = CommandType.StoredProcedure
        };
        cmd.Parameters.AddWithValue("@UserID", id);

        var rows = (int)(await cmd.ExecuteScalarAsync(ct) ?? 0);
        return rows == 0
            ? (false, "User has stock transaction history and cannot be deleted", 409)
            : (true, null, 200);
    }

    private async Task<bool> SalNumberExistsAsync(SqlConnection conn, string salNumber, int? excludeUserId, CancellationToken ct)
    {
        await using var cmd = new SqlCommand("dbo.usp_User_GetBySALNumber", conn)
        {
            CommandType = CommandType.StoredProcedure
        };
        cmd.Parameters.AddWithValue("@SALNumber", salNumber.Trim());

        await using var r = await cmd.ExecuteReaderAsync(ct);
        if (!await r.ReadAsync(ct)) return false;

        var existingId = r.GetInt32(r.GetOrdinal("UserID"));
        return !excludeUserId.HasValue || existingId != excludeUserId.Value;
    }

    private static UserDto MapUserRow(SqlDataReader r, bool includePassword)
    {
        var (first, last) = SplitName(r.GetString(r.GetOrdinal("FullName")));
        var canAccessLms = false;
        if (HasColumn(r, "CanAccessLms") && !r.IsDBNull(r.GetOrdinal("CanAccessLms")))
            canAccessLms = Convert.ToBoolean(r.GetValue(r.GetOrdinal("CanAccessLms")));

        return new UserDto
        {
            Id = r.GetInt32(r.GetOrdinal("UserID")).ToString(),
            SalNumber = r.GetString(r.GetOrdinal("SALNumber")),
            FirstName = first,
            LastName = last,
            Password = includePassword && HasColumn(r, "PasswordHash") && !r.IsDBNull(r.GetOrdinal("PasswordHash"))
                ? r.GetString(r.GetOrdinal("PasswordHash"))
                : "",
            Role = MapRole(r.GetString(r.GetOrdinal("Role"))),
            Status = MapUserStatus(r.GetString(r.GetOrdinal("Status"))),
            CanAccessLms = canAccessLms,
            CreatedAt = r.GetDateTime(r.GetOrdinal("CreatedDate")).ToString("o")
        };
    }

    private static bool HasColumn(SqlDataReader reader, string columnName)
    {
        for (var i = 0; i < reader.FieldCount; i++)
        {
            if (reader.GetName(i).Equals(columnName, StringComparison.OrdinalIgnoreCase))
                return true;
        }
        return false;
    }

    public async Task<List<JobDto>> GetJobsAsync(CancellationToken ct = default)
    {
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync(ct);
        return await LoadJobsAsync(conn, ct);
    }

    public async Task<JobDto?> GetJobByIdAsync(int id, CancellationToken ct = default)
    {
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync(ct);
        const string sql = """
            SELECT JobID, JobNumber, JobType, Description, OrderConfirmation, Category, Status, CreatedDate
            FROM dbo.Jobs WHERE JobID = @id
            """;
        await using var cmd = new SqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("@id", id);
        await using var r = await cmd.ExecuteReaderAsync(ct);
        return await r.ReadAsync(ct) ? MapJobRow(r) : null;
    }

    public async Task<(JobDto? Job, string? Error, int StatusCode)> CreateJobAsync(JobDto job, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(job.JobNumber) || string.IsNullOrWhiteSpace(job.JobDescription))
            return (null, "Job number and description required", 400);

        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync(ct);

        if (await JobNumberExistsAsync(conn, job.JobNumber, null, ct))
            return (null, "Job number already exists", 409);

        await using var cmd = new SqlCommand("""
            INSERT INTO dbo.Jobs (JobNumber, JobType, Description, OrderConfirmation, Category, Status)
            OUTPUT INSERTED.JobID, INSERTED.JobNumber, INSERTED.JobType, INSERTED.Description,
                   INSERTED.OrderConfirmation, INSERTED.Category, INSERTED.Status, INSERTED.CreatedDate
            VALUES (@num, @type, @desc, @oc, @cat, @status)
            """, conn);
        cmd.Parameters.AddWithValue("@num", job.JobNumber);
        cmd.Parameters.AddWithValue("@type", (object?)job.JobType ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@desc", job.JobDescription);
        cmd.Parameters.AddWithValue("@oc", (object?)job.OrderConfirmation ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@cat", (object?)job.Category ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@status", string.IsNullOrWhiteSpace(job.Status) ? "Active" : job.Status);

        await using var r = await cmd.ExecuteReaderAsync(ct);
        if (!await r.ReadAsync(ct)) return (null, "Failed to create job", 500);
        return (MapJobRow(r), null, 201);
    }

    public async Task<(JobDto? Job, string? Error, int StatusCode)> UpdateJobAsync(int id, JobDto job, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(job.JobNumber) || string.IsNullOrWhiteSpace(job.JobDescription))
            return (null, "Job number and description required", 400);

        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync(ct);

        if (await JobNumberExistsAsync(conn, job.JobNumber, id, ct))
            return (null, "Job number already exists", 409);

        await using var cmd = new SqlCommand("""
            UPDATE dbo.Jobs SET JobNumber=@num, JobType=@type, Description=@desc, OrderConfirmation=@oc,
            Category=@cat, Status=@status, ModifiedDate=GETDATE()
            OUTPUT INSERTED.JobID, INSERTED.JobNumber, INSERTED.JobType, INSERTED.Description,
                   INSERTED.OrderConfirmation, INSERTED.Category, INSERTED.Status, INSERTED.CreatedDate
            WHERE JobID=@id
            """, conn);
        cmd.Parameters.AddWithValue("@id", id);
        cmd.Parameters.AddWithValue("@num", job.JobNumber);
        cmd.Parameters.AddWithValue("@type", (object?)job.JobType ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@desc", job.JobDescription);
        cmd.Parameters.AddWithValue("@oc", (object?)job.OrderConfirmation ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@cat", (object?)job.Category ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@status", string.IsNullOrWhiteSpace(job.Status) ? "Active" : job.Status);

        await using var r = await cmd.ExecuteReaderAsync(ct);
        if (!await r.ReadAsync(ct)) return (null, "Job not found", 404);
        return (MapJobRow(r), null, 200);
    }

    public async Task<(bool Deleted, string? Error, int StatusCode)> DeleteJobAsync(int id, CancellationToken ct = default)
    {
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync(ct);
        await using var cmd = new SqlCommand("DELETE FROM dbo.Jobs WHERE JobID = @id", conn);
        cmd.Parameters.AddWithValue("@id", id);
        var rows = await cmd.ExecuteNonQueryAsync(ct);
        return rows == 0 ? (false, "Job not found", 404) : (true, null, 200);
    }

    public async Task<List<StockDto>> GetStockAsync(CancellationToken ct = default)
    {
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync(ct);
        var jobs = await LoadJobsAsync(conn, ct);
        var locations = await LoadStorageLocationsAsync(conn, ct);
        return await LoadStockAsync(conn, jobs, locations, ct);
    }

    public async Task<StockDto?> GetStockByIdAsync(int id, CancellationToken ct = default)
    {
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync(ct);

        await using var cmd = new SqlCommand("dbo.usp_Stock_GetById", conn)
        {
            CommandType = CommandType.StoredProcedure
        };
        cmd.Parameters.AddWithValue("@StockID", id);

        await using var r = await cmd.ExecuteReaderAsync(ct);
        return await r.ReadAsync(ct) ? MapStockRow(r) : null;
    }

    public async Task<(StockDto? Stock, string? Error, int StatusCode)> CreateStockAsync(StockDto stock, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(stock.StockNumber) || string.IsNullOrWhiteSpace(stock.PartDescription))
            return (null, "Stock number and description required", 400);

        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync(ct);

        if (await StockNumberExistsAsync(conn, stock.StockNumber, null, ct))
            return (null, "Stock number already exists", 409);

        var jobId = await ResolveJobIdAsync(conn, stock.JobNumber, ct);
        var locId = await ResolveLocationIdAsync(conn, stock.StorageLocation, ct);
        var status = ComputeStockStatus(stock.Quantity);

        await using var cmd = new SqlCommand("dbo.usp_Stock_Create", conn)
        {
            CommandType = CommandType.StoredProcedure
        };
        AddStockParameters(cmd, stock, jobId, locId, status);

        await using var r = await cmd.ExecuteReaderAsync(ct);
        if (!await r.ReadAsync(ct)) return (null, "Failed to create stock item", 500);
        return (MapStockRow(r), null, 201);
    }

    public async Task<(StockDto? Stock, string? Error, int StatusCode)> UpdateStockAsync(int id, StockDto stock, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(stock.StockNumber) || string.IsNullOrWhiteSpace(stock.PartDescription))
            return (null, "Stock number and description required", 400);

        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync(ct);

        if (await StockNumberExistsAsync(conn, stock.StockNumber, id, ct))
            return (null, "Stock number already exists", 409);

        var jobId = await ResolveJobIdAsync(conn, stock.JobNumber, ct);
        var locId = await ResolveLocationIdAsync(conn, stock.StorageLocation, ct);
        var status = ComputeStockStatus(stock.Quantity);

        await using var cmd = new SqlCommand("dbo.usp_Stock_Update", conn)
        {
            CommandType = CommandType.StoredProcedure
        };
        cmd.Parameters.AddWithValue("@StockID", id);
        AddStockParameters(cmd, stock, jobId, locId, status);

        await using var r = await cmd.ExecuteReaderAsync(ct);
        if (!await r.ReadAsync(ct)) return (null, "Stock item not found", 404);
        return (MapStockRow(r), null, 200);
    }

    public async Task<(bool Deleted, string? Error, int StatusCode)> DeleteStockAsync(int id, CancellationToken ct = default)
    {
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync(ct);
        await using var tx = await conn.BeginTransactionAsync(ct);

        await using (var delTx = new SqlCommand("DELETE FROM dbo.StockTransactions WHERE StockID = @id", conn, (SqlTransaction)tx))
        {
            delTx.Parameters.AddWithValue("@id", id);
            await delTx.ExecuteNonQueryAsync(ct);
        }

        int rows;
        await using (var del = new SqlCommand("DELETE FROM dbo.StockItems WHERE StockID = @id", conn, (SqlTransaction)tx))
        {
            del.Parameters.AddWithValue("@id", id);
            rows = await del.ExecuteNonQueryAsync(ct);
        }

        await tx.CommitAsync(ct);
        return rows == 0 ? (false, "Stock item not found", 404) : (true, null, 200);
    }

    private static StockDto MapStockRow(SqlDataReader r) => new()
    {
        Id = r.GetInt32(r.GetOrdinal("StockID")).ToString(),
        StockNumber = r.GetString(r.GetOrdinal("StockNumber")),
        PartNumber = r.IsDBNull(r.GetOrdinal("PartNumber")) ? "" : r.GetString(r.GetOrdinal("PartNumber")),
        SerialNumber = r.IsDBNull(r.GetOrdinal("SerialNumber")) ? "" : r.GetString(r.GetOrdinal("SerialNumber")),
        PartDescription = r.IsDBNull(r.GetOrdinal("Description")) ? "" : r.GetString(r.GetOrdinal("Description")),
        Quantity = r.GetInt32(r.GetOrdinal("Quantity")),
        PoNumber = r.IsDBNull(r.GetOrdinal("PONumber")) ? "" : r.GetString(r.GetOrdinal("PONumber")),
        StockCategory = MapStockCategory(r.GetString(r.GetOrdinal("StockType"))),
        StorageLocation = HasColumn(r, "LocationName") && !r.IsDBNull(r.GetOrdinal("LocationName"))
            ? r.GetString(r.GetOrdinal("LocationName"))
            : "",
        TrayBin = r.IsDBNull(r.GetOrdinal("TrayBin")) ? "" : r.GetString(r.GetOrdinal("TrayBin")),
        JobNumber = HasColumn(r, "JobNumber") && !r.IsDBNull(r.GetOrdinal("JobNumber"))
            ? r.GetString(r.GetOrdinal("JobNumber"))
            : "",
        JobCategory = HasColumn(r, "JobCategory") && !r.IsDBNull(r.GetOrdinal("JobCategory"))
            ? r.GetString(r.GetOrdinal("JobCategory"))
            : "",
        CreatedAt = r.GetDateTime(r.GetOrdinal("CreatedDate")).ToString("o")
    };

    private static void AddStockParameters(SqlCommand cmd, StockDto stock, int? jobId, int? locId, string status)
    {
        cmd.Parameters.AddWithValue("@StockNumber", stock.StockNumber);
        cmd.Parameters.AddWithValue("@PartNumber", (object?)stock.PartNumber ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@SerialNumber", (object?)stock.SerialNumber ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@Description", stock.PartDescription);
        cmd.Parameters.AddWithValue("@Quantity", stock.Quantity);
        cmd.Parameters.AddWithValue("@PONumber", (object?)stock.PoNumber ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@StockType", MapStockCategoryToDb(stock.StockCategory));
        cmd.Parameters.AddWithValue("@LocationID", (object?)locId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@TrayBin", (object?)stock.TrayBin ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@JobID", (object?)jobId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@Status", status);
    }

    private static string ComputeStockStatus(int quantity) =>
        quantity == 0 ? "Out of Stock" : quantity < 5 ? "Low Stock" : "In Stock";

    private static async Task<bool> StockNumberExistsAsync(SqlConnection conn, string stockNumber, int? excludeId, CancellationToken ct)
    {
        var sql = excludeId.HasValue
            ? "SELECT 1 FROM dbo.StockItems WHERE StockNumber = @num AND StockID <> @id"
            : "SELECT 1 FROM dbo.StockItems WHERE StockNumber = @num";
        await using var cmd = new SqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("@num", stockNumber);
        if (excludeId.HasValue) cmd.Parameters.AddWithValue("@id", excludeId.Value);
        return await cmd.ExecuteScalarAsync(ct) != null;
    }

    private static async Task<int?> ResolveJobIdAsync(SqlConnection conn, string jobNumber, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(jobNumber)) return null;
        await using var cmd = new SqlCommand("SELECT JobID FROM dbo.Jobs WHERE JobNumber = @num", conn);
        cmd.Parameters.AddWithValue("@num", jobNumber);
        var result = await cmd.ExecuteScalarAsync(ct);
        return result is int id ? id : null;
    }

    private static async Task<int?> ResolveLocationIdAsync(SqlConnection conn, string locationName, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(locationName)) return null;
        await using var cmd = new SqlCommand("SELECT LocationID FROM dbo.StorageLocations WHERE LocationName = @name", conn);
        cmd.Parameters.AddWithValue("@name", locationName);
        var result = await cmd.ExecuteScalarAsync(ct);
        return result is int id ? id : null;
    }

    private static JobDto MapJobRow(SqlDataReader r) => new()
    {
        Id = r.GetInt32(r.GetOrdinal("JobID")).ToString(),
        JobNumber = r.GetString(r.GetOrdinal("JobNumber")),
        JobType = r.IsDBNull(r.GetOrdinal("JobType")) ? "" : r.GetString(r.GetOrdinal("JobType")),
        JobDescription = r.IsDBNull(r.GetOrdinal("Description")) ? "" : r.GetString(r.GetOrdinal("Description")),
        OrderConfirmation = r.IsDBNull(r.GetOrdinal("OrderConfirmation")) ? "" : r.GetString(r.GetOrdinal("OrderConfirmation")),
        Category = r.IsDBNull(r.GetOrdinal("Category")) ? "" : r.GetString(r.GetOrdinal("Category")),
        Status = r.GetString(r.GetOrdinal("Status")),
        CreatedAt = r.GetDateTime(r.GetOrdinal("CreatedDate")).ToString("o")
    };

    private static async Task<bool> JobNumberExistsAsync(SqlConnection conn, string jobNumber, int? excludeId, CancellationToken ct)
    {
        var sql = excludeId.HasValue
            ? "SELECT 1 FROM dbo.Jobs WHERE JobNumber = @num AND JobID <> @id"
            : "SELECT 1 FROM dbo.Jobs WHERE JobNumber = @num";
        await using var cmd = new SqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("@num", jobNumber);
        if (excludeId.HasValue) cmd.Parameters.AddWithValue("@id", excludeId.Value);
        var result = await cmd.ExecuteScalarAsync(ct);
        return result != null;
    }

    private static bool VerifyPassword(string password, string hash)
    {
        if (string.IsNullOrWhiteSpace(hash)) return false;
        if (hash is "CHANGE_ME_HASH" or "demo")
            return password is "admin123" or "pass123" or "pass456" or "changeme";
        if (hash.StartsWith("$2", StringComparison.Ordinal))
            return BCrypt.Net.BCrypt.Verify(password, hash);
        return hash == password;
    }

    private async Task<List<UserDto>> LoadUsersAsync(SqlConnection conn, CancellationToken ct)
    {
        var list = new List<UserDto>();
        const string sql = "SELECT UserID, SALNumber, FullName, PasswordHash, Role, Status, CreatedDate, CanAccessLms FROM dbo.Users ORDER BY UserID";
        try
        {
            await using var cmd = new SqlCommand(sql, conn);
            await using var r = await cmd.ExecuteReaderAsync(ct);
            while (await r.ReadAsync(ct))
                list.Add(MapUserRow(r, includePassword: false));
            return list;
        }
        catch
        {
            // Older DBs without CanAccessLms
            const string legacy = "SELECT UserID, SALNumber, FullName, PasswordHash, Role, Status, CreatedDate FROM dbo.Users ORDER BY UserID";
            await using var cmd = new SqlCommand(legacy, conn);
            await using var r = await cmd.ExecuteReaderAsync(ct);
            while (await r.ReadAsync(ct))
                list.Add(MapUserRow(r, includePassword: false));
            return list;
        }
    }

    private async Task<List<StorageLocationDto>> LoadStorageLocationsAsync(SqlConnection conn, CancellationToken ct)
    {
        var list = new List<StorageLocationDto>();
        const string sql = "SELECT LocationID, LocationCode, LocationName, LocationType FROM dbo.StorageLocations ORDER BY LocationID";
        await using var cmd = new SqlCommand(sql, conn);
        await using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct))
        {
            var name = r.GetString(r.GetOrdinal("LocationName"));
            list.Add(new StorageLocationDto
            {
                Id = r.GetInt32(r.GetOrdinal("LocationID")).ToString(),
                Name = name,
                Description = r.GetString(r.GetOrdinal("LocationCode")),
                Building = ExtractBuilding(name),
                Type = r.GetString(r.GetOrdinal("LocationType"))
            });
        }
        return list;
    }

    private async Task<List<JobDto>> LoadJobsAsync(SqlConnection conn, CancellationToken ct)
    {
        var list = new List<JobDto>();
        const string sql = """
            SELECT JobID, JobNumber, JobType, Description, OrderConfirmation, Category, Status, CreatedDate
            FROM dbo.Jobs ORDER BY JobID
            """;
        await using var cmd = new SqlCommand(sql, conn);
        await using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct))
        {
            list.Add(new JobDto
            {
                Id = r.GetInt32(r.GetOrdinal("JobID")).ToString(),
                JobNumber = r.GetString(r.GetOrdinal("JobNumber")),
                JobType = r.IsDBNull(r.GetOrdinal("JobType")) ? "" : r.GetString(r.GetOrdinal("JobType")),
                JobDescription = r.IsDBNull(r.GetOrdinal("Description")) ? "" : r.GetString(r.GetOrdinal("Description")),
                OrderConfirmation = r.IsDBNull(r.GetOrdinal("OrderConfirmation")) ? "" : r.GetString(r.GetOrdinal("OrderConfirmation")),
                Category = r.IsDBNull(r.GetOrdinal("Category")) ? "" : r.GetString(r.GetOrdinal("Category")),
                Status = r.GetString(r.GetOrdinal("Status")),
                CreatedAt = r.GetDateTime(r.GetOrdinal("CreatedDate")).ToString("o")
            });
        }
        return list;
    }

    private async Task<List<StockDto>> LoadStockAsync(SqlConnection conn, List<JobDto> jobs, List<StorageLocationDto> locations, CancellationToken ct)
    {
        var jobById = jobs.ToDictionary(j => j.Id, j => j);
        var locById = locations.ToDictionary(l => l.Id, l => l.Name);
        var list = new List<StockDto>();

        const string sql = """
            SELECT s.StockID, s.StockNumber, s.PartNumber, s.SerialNumber, s.Description, s.Quantity,
                   s.PONumber, s.StockType, s.LocationID, s.TrayBin, s.JobID, s.CreatedDate,
                   j.JobNumber, j.Category AS JobCategory
            FROM dbo.StockItems s
            LEFT JOIN dbo.Jobs j ON s.JobID = j.JobID
            ORDER BY s.StockID
            """;

        await using var cmd = new SqlCommand(sql, conn);
        await using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct))
        {
            var locId = r.IsDBNull(r.GetOrdinal("LocationID")) ? null : r.GetInt32(r.GetOrdinal("LocationID")).ToString();
            list.Add(new StockDto
            {
                Id = r.GetInt32(r.GetOrdinal("StockID")).ToString(),
                StockNumber = r.GetString(r.GetOrdinal("StockNumber")),
                PartNumber = r.IsDBNull(r.GetOrdinal("PartNumber")) ? "" : r.GetString(r.GetOrdinal("PartNumber")),
                SerialNumber = r.IsDBNull(r.GetOrdinal("SerialNumber")) ? "" : r.GetString(r.GetOrdinal("SerialNumber")),
                PartDescription = r.IsDBNull(r.GetOrdinal("Description")) ? "" : r.GetString(r.GetOrdinal("Description")),
                Quantity = r.GetInt32(r.GetOrdinal("Quantity")),
                PoNumber = r.IsDBNull(r.GetOrdinal("PONumber")) ? "" : r.GetString(r.GetOrdinal("PONumber")),
                StockCategory = MapStockCategory(r.GetString(r.GetOrdinal("StockType"))),
                StorageLocation = locId != null && locById.TryGetValue(locId, out var loc) ? loc : "",
                TrayBin = r.IsDBNull(r.GetOrdinal("TrayBin")) ? "" : r.GetString(r.GetOrdinal("TrayBin")),
                JobNumber = r.IsDBNull(r.GetOrdinal("JobNumber")) ? "" : r.GetString(r.GetOrdinal("JobNumber")),
                JobCategory = r.IsDBNull(r.GetOrdinal("JobCategory")) ? "" : r.GetString(r.GetOrdinal("JobCategory")),
                CreatedAt = r.GetDateTime(r.GetOrdinal("CreatedDate")).ToString("o")
            });
        }
        return list;
    }

    private async Task<List<TransactionDto>> LoadTransactionsAsync(
        SqlConnection conn, List<StockDto> stock, List<UserDto> users, List<JobDto> jobs,
        List<StorageLocationDto> locations, CancellationToken ct)
    {
        var stockById = stock.ToDictionary(s => s.Id, s => s);
        var userById = users.ToDictionary(u => u.Id, u => $"{u.FirstName} {u.LastName}".Trim());
        var jobById = jobs.ToDictionary(j => j.Id, j => j.JobNumber);
        var locById = locations.ToDictionary(l => l.Id, l => l.Name);
        var list = new List<TransactionDto>();

        const string sql = """
            SELECT t.TransactionID, t.StockID, t.TransactionType, t.QuantityChange, t.QuantityAfter,
                   t.FromJobID, t.ToJobID, t.FromLocationID, t.ToLocationID, t.PerformedByUserID,
                   t.Notes, t.TransactionDate
            FROM dbo.StockTransactions t ORDER BY t.TransactionDate DESC
            """;

        await using var cmd = new SqlCommand(sql, conn);
        await using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct))
        {
            var stockId = r.GetInt32(r.GetOrdinal("StockID")).ToString();
            stockById.TryGetValue(stockId, out var stockItem);
            var userId = r.GetInt32(r.GetOrdinal("PerformedByUserID")).ToString();
            var toLocId = r.IsDBNull(r.GetOrdinal("ToLocationID")) ? null : r.GetInt32(r.GetOrdinal("ToLocationID")).ToString();
            var fromLocId = r.IsDBNull(r.GetOrdinal("FromLocationID")) ? null : r.GetInt32(r.GetOrdinal("FromLocationID")).ToString();
            var toJobId = r.IsDBNull(r.GetOrdinal("ToJobID")) ? null : r.GetInt32(r.GetOrdinal("ToJobID")).ToString();
            var fromJobId = r.IsDBNull(r.GetOrdinal("FromJobID")) ? null : r.GetInt32(r.GetOrdinal("FromJobID")).ToString();

            var qtyChange = r.GetInt32(r.GetOrdinal("QuantityChange"));
            var qtyAfter = r.GetInt32(r.GetOrdinal("QuantityAfter"));
            var storedType = r.GetString(r.GetOrdinal("TransactionType"));

            list.Add(new TransactionDto
            {
                Id = r.GetInt32(r.GetOrdinal("TransactionID")).ToString(),
                StockItemId = stockId,
                StockNumber = stockItem?.StockNumber ?? "",
                PartDescription = stockItem?.PartDescription ?? "",
                Type = TransactionTypeHelper.DisplayType(storedType),
                Quantity = Math.Abs(qtyChange),
                QtyBefore = Math.Max(0, qtyAfter - qtyChange),
                QtyAfter = qtyAfter,
                StorageLocation = toLocId != null && locById.TryGetValue(toLocId, out var tl) ? tl :
                    fromLocId != null && locById.TryGetValue(fromLocId, out var fl) ? fl : stockItem?.StorageLocation ?? "",
                JobNumber = toJobId != null && jobById.TryGetValue(toJobId, out var tj) ? tj :
                    fromJobId != null && jobById.TryGetValue(fromJobId, out var fj) ? fj : "",
                TransferTo = toJobId != null && jobById.TryGetValue(toJobId, out var tt) ? tt : "",
                TransferFrom = fromJobId != null && jobById.TryGetValue(fromJobId, out var tf) ? tf : "",
                PoNumber = stockItem?.PoNumber ?? "",
                Comment = r.IsDBNull(r.GetOrdinal("Notes")) ? "" : r.GetString(r.GetOrdinal("Notes")),
                UserName = userById.TryGetValue(userId, out var un) ? un : "System",
                Timestamp = r.GetDateTime(r.GetOrdinal("TransactionDate")).ToString("o")
            });
        }
        return list;
    }

    private async Task<List<ActivityDto>> LoadActivityAsync(SqlConnection conn, List<UserDto> users, CancellationToken ct)
    {
        var userById = users.ToDictionary(u => u.Id, u => $"{u.FirstName} {u.LastName}".Trim());
        var list = new List<ActivityDto>();

        const string sql = """
            SELECT ActivityID, UserID, ActivityType, ActionText, ActivityDate
            FROM dbo.ActivityLog ORDER BY ActivityDate DESC
            """;

        await using var cmd = new SqlCommand(sql, conn);
        await using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct))
        {
            var userId = r.IsDBNull(r.GetOrdinal("UserID")) ? null : r.GetInt32(r.GetOrdinal("UserID")).ToString();
            var actionText = r.GetString(r.GetOrdinal("ActionText"));
            list.Add(new ActivityDto
            {
                Id = r.GetInt32(r.GetOrdinal("ActivityID")).ToString(),
                UserName = userId != null && userById.TryGetValue(userId, out var n) ? n : "System",
                ActionPerformed = Capitalize(r.GetString(r.GetOrdinal("ActivityType"))),
                ScreenVisited = "App",
                ActivityDescription = actionText,
                Timestamp = r.GetDateTime(r.GetOrdinal("ActivityDate")).ToString("o")
            });
        }
        return list;
    }

    private async Task<Dictionary<string, object?>> LoadSettingsAsync(SqlConnection conn, CancellationToken ct)
    {
        var settings = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase)
        {
            ["company"] = "Storage Management Systems (PTY) Ltd",
            ["lowStockThreshold"] = 5,
            ["lowStockAlert"] = true,
            ["activityLog"] = true
        };

        const string sql = "SELECT SettingKey, SettingValue FROM dbo.Settings";
        await using var cmd = new SqlCommand(sql, conn);
        await using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct))
        {
            var key = r.GetString(r.GetOrdinal("SettingKey"));
            var value = r.IsDBNull(r.GetOrdinal("SettingValue")) ? "" : r.GetString(r.GetOrdinal("SettingValue"));
            switch (key)
            {
                case "CompanyName": settings["company"] = value; break;
                case "LowStockThreshold":
                    if (int.TryParse(value, out var n)) settings["lowStockThreshold"] = n;
                    break;
                case "LowStockAlert": settings["lowStockAlert"] = value is "1" or "true" or "True"; break;
                case "ActivityLog": settings["activityLog"] = value is not "0" and not "false" and not "False"; break;
                default: settings[key] = value; break;
            }
        }
        return settings;
    }

    private async Task<List<AuditDto>> LoadAuditsAsync(SqlConnection conn, CancellationToken ct)
    {
        var list = new List<AuditDto>();
        if (!await TableExistsAsync(conn, "InventoryAudits", ct)) return list;

        const string sql = """
            SELECT AuditID, AuditDate, StockNumber, PartDescription, SystemQty, AuditedQty, Result, AuditedBy
            FROM dbo.InventoryAudits ORDER BY AuditDate DESC
            """;
        await using var cmd = new SqlCommand(sql, conn);
        await using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct))
        {
            list.Add(new AuditDto
            {
                Id = r.GetInt32(r.GetOrdinal("AuditID")).ToString(),
                AuditDate = r.GetDateTime(r.GetOrdinal("AuditDate")).ToString("o"),
                StockNumber = r.GetString(r.GetOrdinal("StockNumber")),
                PartDescription = r.IsDBNull(r.GetOrdinal("PartDescription")) ? "" : r.GetString(r.GetOrdinal("PartDescription")),
                SystemQty = r.GetInt32(r.GetOrdinal("SystemQty")),
                AuditedQty = r.GetInt32(r.GetOrdinal("AuditedQty")),
                Result = r.GetString(r.GetOrdinal("Result")),
                AuditedBy = r.GetString(r.GetOrdinal("AuditedBy"))
            });
        }
        return list;
    }

    private async Task<List<ReconciliationDto>> LoadReconciliationsAsync(SqlConnection conn, CancellationToken ct)
    {
        var list = new List<ReconciliationDto>();
        if (!await TableExistsAsync(conn, "Reconciliations", ct)) return list;

        const string sql = """
            SELECT ReconciliationID, StockNumber, PartDescription, SystemQty, PhysicalQty, Variance, Status, ReconciledAt
            FROM dbo.Reconciliations ORDER BY ReconciledAt DESC
            """;
        await using var cmd = new SqlCommand(sql, conn);
        await using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct))
        {
            list.Add(new ReconciliationDto
            {
                Id = r.GetInt32(r.GetOrdinal("ReconciliationID")).ToString(),
                StockNumber = r.GetString(r.GetOrdinal("StockNumber")),
                PartDescription = r.IsDBNull(r.GetOrdinal("PartDescription")) ? "" : r.GetString(r.GetOrdinal("PartDescription")),
                SystemQty = r.GetInt32(r.GetOrdinal("SystemQty")),
                PhysicalQty = r.GetInt32(r.GetOrdinal("PhysicalQty")),
                Variance = r.GetInt32(r.GetOrdinal("Variance")),
                Status = r.GetString(r.GetOrdinal("Status")),
                ReconciledAt = r.IsDBNull(r.GetOrdinal("ReconciledAt")) ? null : r.GetDateTime(r.GetOrdinal("ReconciledAt")).ToString("o")
            });
        }
        return list;
    }

    private async Task SyncUsersAsync(SqlConnection conn, SqlTransaction tx, List<UserDto> users, CancellationToken ct)
    {
        var existing = new HashSet<int>();
        await using (var cmd = new SqlCommand("SELECT UserID FROM dbo.Users", conn, tx))
        await using (var r = await cmd.ExecuteReaderAsync(ct))
            while (await r.ReadAsync(ct)) existing.Add(r.GetInt32(0));

        var incoming = new HashSet<int>();
        foreach (var u in users)
        {
            if (!int.TryParse(u.Id, out var id) || id <= 0)
            {
                id = await InsertUserAsync(conn, tx, u, ct);
                u.Id = id.ToString();
            }
            else
            {
                incoming.Add(id);
                await UpdateUserAsync(conn, tx, u, ct);
            }
        }

        foreach (var id in existing.Except(incoming))
        {
            await using var del = new SqlCommand("DELETE FROM dbo.Users WHERE UserID = @id", conn, tx);
            del.Parameters.AddWithValue("@id", id);
            await del.ExecuteNonQueryAsync(ct);
        }
    }

    private async Task<int> InsertUserAsync(SqlConnection conn, SqlTransaction tx, UserDto u, CancellationToken ct)
    {
        const string sql = """
            INSERT INTO dbo.Users (SALNumber, FullName, Email, PasswordHash, Role, DepartmentID, Status, CanAccessLms)
            OUTPUT INSERTED.UserID
            VALUES (@sal, @name, NULL, @hash, @role, NULL, @status, @lms)
            """;
        await using var cmd = new SqlCommand(sql, conn, tx);
        cmd.Parameters.AddWithValue("@sal", u.SalNumber);
        cmd.Parameters.AddWithValue("@name", $"{u.FirstName} {u.LastName}".Trim());
        cmd.Parameters.AddWithValue("@hash", HashPassword(u.Password));
        cmd.Parameters.AddWithValue("@role", PermissionService.MapRoleToDb(u.Role));
        cmd.Parameters.AddWithValue("@status", MapUserStatusToDb(u.Status));
        cmd.Parameters.AddWithValue("@lms", u.CanAccessLms);
        return (int)(await cmd.ExecuteScalarAsync(ct) ?? 0);
    }

    private async Task UpdateUserAsync(SqlConnection conn, SqlTransaction tx, UserDto u, CancellationToken ct)
    {
        var sql = """
            UPDATE dbo.Users SET SALNumber=@sal, FullName=@name, Role=@role, Status=@status, CanAccessLms=@lms, ModifiedDate=GETDATE()
            WHERE UserID=@id
            """;
        if (!string.IsNullOrWhiteSpace(u.Password))
            sql = """
                UPDATE dbo.Users SET SALNumber=@sal, FullName=@name, PasswordHash=@hash, Role=@role, Status=@status, CanAccessLms=@lms, ModifiedDate=GETDATE()
                WHERE UserID=@id
                """;

        await using var cmd = new SqlCommand(sql, conn, tx);
        cmd.Parameters.AddWithValue("@id", int.Parse(u.Id));
        cmd.Parameters.AddWithValue("@sal", u.SalNumber);
        cmd.Parameters.AddWithValue("@name", $"{u.FirstName} {u.LastName}".Trim());
        cmd.Parameters.AddWithValue("@role", PermissionService.MapRoleToDb(u.Role));
        cmd.Parameters.AddWithValue("@status", MapUserStatusToDb(u.Status));
        cmd.Parameters.AddWithValue("@lms", u.CanAccessLms);
        if (!string.IsNullOrWhiteSpace(u.Password))
            cmd.Parameters.AddWithValue("@hash", HashPassword(u.Password));
        await cmd.ExecuteNonQueryAsync(ct);
    }

    private async Task SyncStorageLocationsAsync(SqlConnection conn, SqlTransaction tx, List<StorageLocationDto> locations, CancellationToken ct)
    {
        var existing = new HashSet<int>();
        await using (var cmd = new SqlCommand("SELECT LocationID FROM dbo.StorageLocations", conn, tx))
        await using (var r = await cmd.ExecuteReaderAsync(ct))
            while (await r.ReadAsync(ct)) existing.Add(r.GetInt32(0));

        var incoming = new HashSet<int>();
        foreach (var loc in locations)
        {
            if (!int.TryParse(loc.Id, out var id) || id <= 0)
            {
                id = await InsertLocationAsync(conn, tx, loc, ct);
                loc.Id = id.ToString();
            }
            else
            {
                incoming.Add(id);
                await using var cmd = new SqlCommand("""
                    UPDATE dbo.StorageLocations SET LocationName=@name, LocationType=@type, LocationCode=@code, ModifiedDate=GETDATE()
                    WHERE LocationID=@id
                    """, conn, tx);
                cmd.Parameters.AddWithValue("@id", id);
                cmd.Parameters.AddWithValue("@name", loc.Name);
                cmd.Parameters.AddWithValue("@type", string.IsNullOrWhiteSpace(loc.Type) ? "Other" : loc.Type);
                cmd.Parameters.AddWithValue("@code", string.IsNullOrWhiteSpace(loc.Description) ? $"LOC-{id:D3}" : loc.Description);
                await cmd.ExecuteNonQueryAsync(ct);
            }
        }

        foreach (var id in existing.Except(incoming))
        {
            await using var del = new SqlCommand("DELETE FROM dbo.StorageLocations WHERE LocationID = @id", conn, tx);
            del.Parameters.AddWithValue("@id", id);
            await del.ExecuteNonQueryAsync(ct);
        }
    }

    private async Task<int> InsertLocationAsync(SqlConnection conn, SqlTransaction tx, StorageLocationDto loc, CancellationToken ct)
    {
        const string sql = """
            INSERT INTO dbo.StorageLocations (LocationCode, LocationName, LocationType, Capacity, UsedCapacity)
            OUTPUT INSERTED.LocationID VALUES (@code, @name, @type, 100, 0)
            """;
        await using var cmd = new SqlCommand(sql, conn, tx);
        cmd.Parameters.AddWithValue("@code", string.IsNullOrWhiteSpace(loc.Description) ? "LOC-NEW" : loc.Description);
        cmd.Parameters.AddWithValue("@name", loc.Name);
        cmd.Parameters.AddWithValue("@type", string.IsNullOrWhiteSpace(loc.Type) ? "Other" : loc.Type);
        return (int)(await cmd.ExecuteScalarAsync(ct) ?? 0);
    }

    private async Task SyncJobsAsync(SqlConnection conn, SqlTransaction tx, List<JobDto> jobs, CancellationToken ct)
    {
        var existing = new HashSet<int>();
        await using (var cmd = new SqlCommand("SELECT JobID FROM dbo.Jobs", conn, tx))
        await using (var r = await cmd.ExecuteReaderAsync(ct))
            while (await r.ReadAsync(ct)) existing.Add(r.GetInt32(0));

        var incoming = new HashSet<int>();
        foreach (var j in jobs)
        {
            if (!int.TryParse(j.Id, out var id) || id <= 0)
            {
                id = await InsertJobAsync(conn, tx, j, ct);
                j.Id = id.ToString();
            }
            else
            {
                incoming.Add(id);
                await using var cmd = new SqlCommand("""
                    UPDATE dbo.Jobs SET JobNumber=@num, JobType=@type, Description=@desc, OrderConfirmation=@oc,
                    Category=@cat, Status=@status, ModifiedDate=GETDATE() WHERE JobID=@id
                    """, conn, tx);
                cmd.Parameters.AddWithValue("@id", id);
                cmd.Parameters.AddWithValue("@num", j.JobNumber);
                cmd.Parameters.AddWithValue("@type", (object?)j.JobType ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@desc", j.JobDescription);
                cmd.Parameters.AddWithValue("@oc", (object?)j.OrderConfirmation ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@cat", (object?)j.Category ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@status", j.Status);
                await cmd.ExecuteNonQueryAsync(ct);
            }
        }

        foreach (var id in existing.Except(incoming))
        {
            await using var del = new SqlCommand("DELETE FROM dbo.Jobs WHERE JobID = @id", conn, tx);
            del.Parameters.AddWithValue("@id", id);
            await del.ExecuteNonQueryAsync(ct);
        }
    }

    private async Task<int> InsertJobAsync(SqlConnection conn, SqlTransaction tx, JobDto j, CancellationToken ct)
    {
        const string sql = """
            INSERT INTO dbo.Jobs (JobNumber, JobType, Description, OrderConfirmation, Category, Status)
            OUTPUT INSERTED.JobID VALUES (@num, @type, @desc, @oc, @cat, @status)
            """;
        await using var cmd = new SqlCommand(sql, conn, tx);
        cmd.Parameters.AddWithValue("@num", j.JobNumber);
        cmd.Parameters.AddWithValue("@type", (object?)j.JobType ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@desc", j.JobDescription);
        cmd.Parameters.AddWithValue("@oc", (object?)j.OrderConfirmation ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@cat", (object?)j.Category ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@status", j.Status);
        return (int)(await cmd.ExecuteScalarAsync(ct) ?? 0);
    }

    private async Task SyncStockAsync(SqlConnection conn, SqlTransaction tx, List<StockDto> stock, List<JobDto> jobs, List<StorageLocationDto> locations, CancellationToken ct)
    {
        var jobByNumber = jobs.ToDictionary(j => j.JobNumber, j => int.Parse(j.Id));
        var locByName = locations.ToDictionary(l => l.Name, l => int.Parse(l.Id));

        var existing = new HashSet<int>();
        await using (var cmd = new SqlCommand("SELECT StockID FROM dbo.StockItems", conn, tx))
        await using (var r = await cmd.ExecuteReaderAsync(ct))
            while (await r.ReadAsync(ct)) existing.Add(r.GetInt32(0));

        var incoming = new HashSet<int>();
        foreach (var s in stock)
        {
            int? jobId = !string.IsNullOrWhiteSpace(s.JobNumber) && jobByNumber.TryGetValue(s.JobNumber, out var jid) ? jid : null;
            int? locId = !string.IsNullOrWhiteSpace(s.StorageLocation) && locByName.TryGetValue(s.StorageLocation, out var lid) ? lid : null;

            if (!int.TryParse(s.Id, out var id) || id <= 0)
            {
                id = await InsertStockAsync(conn, tx, s, jobId, locId, ct);
                s.Id = id.ToString();
            }
            else
            {
                incoming.Add(id);
                await using var cmd = new SqlCommand("""
                    UPDATE dbo.StockItems SET StockNumber=@num, PartNumber=@pn, SerialNumber=@sn, Description=@desc,
                    Quantity=@qty, PONumber=@po, StockType=@type, LocationID=@loc, TrayBin=@bin, JobID=@job,
                    Status=@status, ModifiedDate=GETDATE() WHERE StockID=@id
                    """, conn, tx);
                cmd.Parameters.AddWithValue("@id", id);
                cmd.Parameters.AddWithValue("@num", s.StockNumber);
                cmd.Parameters.AddWithValue("@pn", (object?)s.PartNumber ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@sn", (object?)s.SerialNumber ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@desc", s.PartDescription);
                cmd.Parameters.AddWithValue("@qty", s.Quantity);
                cmd.Parameters.AddWithValue("@po", (object?)s.PoNumber ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@type", MapStockCategoryToDb(s.StockCategory));
                cmd.Parameters.AddWithValue("@loc", (object?)locId ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@bin", (object?)s.TrayBin ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@job", (object?)jobId ?? DBNull.Value);
                cmd.Parameters.AddWithValue("@status", s.Quantity == 0 ? "Out of Stock" : s.Quantity < 5 ? "Low Stock" : "In Stock");
                await cmd.ExecuteNonQueryAsync(ct);
            }
        }

        foreach (var id in existing.Except(incoming))
        {
            await using var delTx = new SqlCommand("DELETE FROM dbo.StockTransactions WHERE StockID = @id", conn, tx);
            delTx.Parameters.AddWithValue("@id", id);
            await delTx.ExecuteNonQueryAsync(ct);

            await using var del = new SqlCommand("DELETE FROM dbo.StockItems WHERE StockID = @id", conn, tx);
            del.Parameters.AddWithValue("@id", id);
            await del.ExecuteNonQueryAsync(ct);
        }
    }

    private async Task<int> InsertStockAsync(SqlConnection conn, SqlTransaction tx, StockDto s, int? jobId, int? locId, CancellationToken ct)
    {
        const string sql = """
            INSERT INTO dbo.StockItems (StockNumber, PartNumber, SerialNumber, Description, Quantity, PONumber, StockType, LocationID, TrayBin, JobID, Status)
            OUTPUT INSERTED.StockID VALUES (@num, @pn, @sn, @desc, @qty, @po, @type, @loc, @bin, @job, @status)
            """;
        await using var cmd = new SqlCommand(sql, conn, tx);
        cmd.Parameters.AddWithValue("@num", s.StockNumber);
        cmd.Parameters.AddWithValue("@pn", (object?)s.PartNumber ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@sn", (object?)s.SerialNumber ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@desc", s.PartDescription);
        cmd.Parameters.AddWithValue("@qty", s.Quantity);
        cmd.Parameters.AddWithValue("@po", (object?)s.PoNumber ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@type", MapStockCategoryToDb(s.StockCategory));
        cmd.Parameters.AddWithValue("@loc", (object?)locId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@bin", (object?)s.TrayBin ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@job", (object?)jobId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@status", s.Quantity == 0 ? "Out of Stock" : s.Quantity < 5 ? "Low Stock" : "In Stock");
        return (int)(await cmd.ExecuteScalarAsync(ct) ?? 0);
    }

    private async Task SyncTransactionsAsync(
        SqlConnection conn, SqlTransaction tx, List<TransactionDto> transactions,
        List<StockDto> stock, List<UserDto> users, List<JobDto> jobs, List<StorageLocationDto> locations, CancellationToken ct)
    {
        await using var clear = new SqlCommand("DELETE FROM dbo.StockTransactions", conn, tx);
        await clear.ExecuteNonQueryAsync(ct);

        var stockById = stock.ToDictionary(s => s.Id, s => int.Parse(s.Id));
        var stockByNumber = stock.ToDictionary(s => s.StockNumber, s => int.Parse(s.Id));
        var userByName = users.ToDictionary(u => $"{u.FirstName} {u.LastName}".Trim(), u => int.Parse(u.Id));
        var jobByNumber = jobs.ToDictionary(j => j.JobNumber, j => int.Parse(j.Id));
        var locByName = locations.ToDictionary(l => l.Name, l => int.Parse(l.Id));

        foreach (var t in transactions.OrderBy(x => x.Timestamp))
        {
            var stockId = !string.IsNullOrWhiteSpace(t.StockItemId) && stockById.ContainsKey(t.StockItemId)
                ? int.Parse(t.StockItemId)
                : stockByNumber.TryGetValue(t.StockNumber, out var sid) ? sid : 0;
            if (stockId == 0) continue;

            var userId = userByName.TryGetValue(t.UserName, out var uid) ? uid : (users.FirstOrDefault() is { } u ? int.Parse(u.Id) : 1);
            int? toJob = !string.IsNullOrWhiteSpace(t.TransferTo) && jobByNumber.TryGetValue(t.TransferTo, out var tj) ? tj :
                !string.IsNullOrWhiteSpace(t.JobNumber) && jobByNumber.TryGetValue(t.JobNumber, out var jn) ? jn : null;
            int? fromJob = !string.IsNullOrWhiteSpace(t.TransferFrom) && jobByNumber.TryGetValue(t.TransferFrom, out var fj) ? fj : null;
            int? toLoc = !string.IsNullOrWhiteSpace(t.StorageLocation) && locByName.TryGetValue(t.StorageLocation, out var tl) ? tl : null;

            var qtyChange = TransactionTypeHelper.ComputeQuantityChange(t.Type, t.Quantity, t.QtyBefore, t.QtyAfter);
            var qtyAfter = t.QtyAfter ?? 0;
            var storedType = TransactionTypeHelper.Normalize(t.Type);

            await using var cmd = new SqlCommand("""
                INSERT INTO dbo.StockTransactions
                (StockID, TransactionType, QuantityChange, QuantityBefore, QuantityAfter, FromJobID, ToJobID, FromLocationID, ToLocationID, PerformedByUserID, Notes, TransactionDate)
                VALUES (@stock, @type, @change, @before, @after, @fromJob, @toJob, NULL, @toLoc, @user, @notes, @date)
                """, conn, tx);
            cmd.Parameters.AddWithValue("@stock", stockId);
            cmd.Parameters.AddWithValue("@type", storedType);
            cmd.Parameters.AddWithValue("@change", qtyChange);
            cmd.Parameters.AddWithValue("@before", t.QtyBefore ?? Math.Max(0, qtyAfter - qtyChange));
            cmd.Parameters.AddWithValue("@after", qtyAfter);
            cmd.Parameters.AddWithValue("@fromJob", (object?)fromJob ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@toJob", (object?)toJob ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@toLoc", (object?)toLoc ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@user", userId);
            cmd.Parameters.AddWithValue("@notes", (object?)t.Comment ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@date", DateTime.TryParse(t.Timestamp, out var dt) ? dt : DateTime.UtcNow);
            await cmd.ExecuteNonQueryAsync(ct);
        }
    }

    private async Task SyncActivityAsync(SqlConnection conn, SqlTransaction tx, List<ActivityDto> activity, List<UserDto> users, CancellationToken ct)
    {
        await using var clear = new SqlCommand("DELETE FROM dbo.ActivityLog", conn, tx);
        await clear.ExecuteNonQueryAsync(ct);

        var userByName = users.ToDictionary(u => $"{u.FirstName} {u.LastName}".Trim(), u => int.Parse(u.Id));

        foreach (var a in activity.Take(500))
        {
            int? userId = userByName.TryGetValue(a.UserName, out var uid) ? uid : null;
            await using var cmd = new SqlCommand("""
                INSERT INTO dbo.ActivityLog (UserID, ActivityType, ActionText, ActivityDate)
                VALUES (@user, @type, @text, @date)
                """, conn, tx);
            cmd.Parameters.AddWithValue("@user", (object?)userId ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@type", a.ActionPerformed.ToLowerInvariant());
            cmd.Parameters.AddWithValue("@text", $"{a.ScreenVisited}: {a.ActivityDescription}");
            cmd.Parameters.AddWithValue("@date", DateTime.TryParse(a.Timestamp, out var dt) ? dt : DateTime.UtcNow);
            await cmd.ExecuteNonQueryAsync(ct);
        }
    }

    private async Task SyncSettingsAsync(SqlConnection conn, SqlTransaction tx, Dictionary<string, object?> settings, CancellationToken ct)
    {
        var map = new Dictionary<string, string>
        {
            ["company"] = "CompanyName",
            ["lowStockThreshold"] = "LowStockThreshold",
            ["lowStockAlert"] = "LowStockAlert",
            ["activityLog"] = "ActivityLog"
        };

        foreach (var (key, dbKey) in map)
        {
            if (!settings.TryGetValue(key, out var val) || val is null) continue;
            var strVal = val switch
            {
                bool b => b ? "1" : "0",
                _ => val.ToString() ?? ""
            };
            await using var cmd = new SqlCommand("""
                IF EXISTS (SELECT 1 FROM dbo.Settings WHERE SettingKey = @key)
                    UPDATE dbo.Settings SET SettingValue = @val, ModifiedDate = GETDATE() WHERE SettingKey = @key
                ELSE
                    INSERT INTO dbo.Settings (SettingKey, SettingValue) VALUES (@key, @val)
                """, conn, tx);
            cmd.Parameters.AddWithValue("@key", dbKey);
            cmd.Parameters.AddWithValue("@val", strVal);
            await cmd.ExecuteNonQueryAsync(ct);
        }
    }

    private async Task SyncAuditsAsync(SqlConnection conn, SqlTransaction tx, List<AuditDto> audits, CancellationToken ct)
    {
        if (!await TableExistsAsync(conn, "InventoryAudits", ct, tx)) return;
        await using var clear = new SqlCommand("DELETE FROM dbo.InventoryAudits", conn, tx);
        await clear.ExecuteNonQueryAsync(ct);

        foreach (var a in audits)
        {
            await using var cmd = new SqlCommand("""
                INSERT INTO dbo.InventoryAudits (AuditDate, StockNumber, PartDescription, SystemQty, AuditedQty, Result, AuditedBy)
                VALUES (@date, @stock, @desc, @sys, @aud, @result, @by)
                """, conn, tx);
            cmd.Parameters.AddWithValue("@date", DateTime.TryParse(a.AuditDate, out var dt) ? dt : DateTime.UtcNow);
            cmd.Parameters.AddWithValue("@stock", a.StockNumber);
            cmd.Parameters.AddWithValue("@desc", a.PartDescription);
            cmd.Parameters.AddWithValue("@sys", a.SystemQty);
            cmd.Parameters.AddWithValue("@aud", a.AuditedQty);
            cmd.Parameters.AddWithValue("@result", a.Result);
            cmd.Parameters.AddWithValue("@by", a.AuditedBy);
            await cmd.ExecuteNonQueryAsync(ct);
        }
    }

    private async Task SyncReconciliationsAsync(SqlConnection conn, SqlTransaction tx, List<ReconciliationDto> items, CancellationToken ct)
    {
        if (!await TableExistsAsync(conn, "Reconciliations", ct, tx)) return;
        await using var clear = new SqlCommand("DELETE FROM dbo.Reconciliations", conn, tx);
        await clear.ExecuteNonQueryAsync(ct);

        foreach (var r in items)
        {
            await using var cmd = new SqlCommand("""
                INSERT INTO dbo.Reconciliations (StockNumber, PartDescription, SystemQty, PhysicalQty, Variance, Status, ReconciledAt)
                VALUES (@stock, @desc, @sys, @phys, @var, @status, @date)
                """, conn, tx);
            cmd.Parameters.AddWithValue("@stock", r.StockNumber);
            cmd.Parameters.AddWithValue("@desc", r.PartDescription);
            cmd.Parameters.AddWithValue("@sys", r.SystemQty);
            cmd.Parameters.AddWithValue("@phys", r.PhysicalQty);
            cmd.Parameters.AddWithValue("@var", r.Variance);
            cmd.Parameters.AddWithValue("@status", r.Status);
            cmd.Parameters.AddWithValue("@date", DateTime.TryParse(r.ReconciledAt ?? "", out var dt) ? dt : DateTime.UtcNow);
            await cmd.ExecuteNonQueryAsync(ct);
        }
    }

    private static async Task<bool> TableExistsAsync(SqlConnection conn, string table, CancellationToken ct, SqlTransaction? tx = null)
    {
        await using var cmd = new SqlCommand("SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = @t", conn, tx);
        cmd.Parameters.AddWithValue("@t", table);
        return await cmd.ExecuteScalarAsync(ct) != null;
    }

    private static string HashPassword(string password)
    {
        if (string.IsNullOrWhiteSpace(password)) return BCrypt.Net.BCrypt.HashPassword("changeme");
        return BCrypt.Net.BCrypt.HashPassword(password);
    }

    private static (string First, string Last) SplitName(string fullName)
    {
        var parts = fullName.Trim().Split(' ', 2, StringSplitOptions.RemoveEmptyEntries);
        return parts.Length switch
        {
            0 => ("User", ""),
            1 => (parts[0], ""),
            _ => (parts[0], parts[1])
        };
    }

    private static string ExtractBuilding(string name)
    {
        var start = name.IndexOf('(');
        var end = name.IndexOf(')');
        if (start >= 0 && end > start) return name[(start + 1)..end];
        return "";
    }

    private static string MapRole(string role) => PermissionService.MapRoleFromDb(role);

    private static string MapUserStatus(string status) => status switch
    {
        "A" => "Active",
        "I" => "Inactive",
        "B" => "Blocked",
        _ => status
    };

    private static string MapUserStatusToDb(string status) => status switch
    {
        "Active" => "A",
        "Inactive" => "I",
        "Blocked" => "B",
        _ => "A"
    };

    private static string MapStockCategory(string type) => type switch
    {
        "Production Inventory" => "Production Inventory",
        "Service Inventory" => "Service Inventory",
        "Legacy Inventory" => "Legacy Inventory",
        "Production" => "Production Inventory",
        "Service" => "Service Inventory",
        "Dismissed" => "Legacy Inventory",
        "General" => "Production Inventory",
        "Job" => "Production Inventory",
        "General Stock" => "Production Inventory",
        "Service Stock" => "Service Inventory",
        "Job-Specific Stock" => "Production Inventory",
        _ => "Production Inventory"
    };

    private static string MapStockCategoryToDb(string category) => category switch
    {
        "Production Inventory" => "Production Inventory",
        "Service Inventory" => "Service Inventory",
        "Legacy Inventory" => "Legacy Inventory",
        "Production" => "Production Inventory",
        "Service" => "Service Inventory",
        "Dismissed" => "Legacy Inventory",
        "Service Stock" => "Service Inventory",
        "General Stock" => "Production Inventory",
        "Job-Specific Stock" => "Production Inventory",
        _ => "Production Inventory"
    };

    private static string Capitalize(string s) =>
        string.IsNullOrWhiteSpace(s) ? s : char.ToUpperInvariant(s[0]) + s[1..];
}
