using ManageIT.Api.Models;
using Microsoft.Data.SqlClient;

namespace ManageIT.Api.Services;

public sealed partial class ManageItDataService
{
    // ── Storage locations ─────────────────────────────────────────────

    public async Task<List<StorageLocationDto>> GetStorageLocationsAsync(CancellationToken ct = default)
    {
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync(ct);
        return await LoadStorageLocationsAsync(conn, ct);
    }

    public async Task<StorageLocationDto?> GetStorageLocationByIdAsync(int id, CancellationToken ct = default)
    {
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync(ct);
        await using var cmd = new SqlCommand(
            "SELECT LocationID, LocationCode, LocationName, LocationType FROM dbo.StorageLocations WHERE LocationID = @id", conn);
        cmd.Parameters.AddWithValue("@id", id);
        await using var r = await cmd.ExecuteReaderAsync(ct);
        if (!await r.ReadAsync(ct)) return null;
        var name = r.GetString(r.GetOrdinal("LocationName"));
        return new StorageLocationDto
        {
            Id = r.GetInt32(r.GetOrdinal("LocationID")).ToString(),
            Name = name,
            Description = r.GetString(r.GetOrdinal("LocationCode")),
            Building = ExtractBuilding(name),
            Type = r.GetString(r.GetOrdinal("LocationType"))
        };
    }

    public async Task<(StorageLocationDto? Location, string? Error, int StatusCode)> CreateStorageLocationAsync(
        StorageLocationDto loc, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(loc.Name))
            return (null, "Location name required", 400);

        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync(ct);
        await using var tx = (SqlTransaction)await conn.BeginTransactionAsync(ct);
        try
        {
            var id = await InsertLocationAsync(conn, tx, loc, ct);
            await tx.CommitAsync(ct);
            return (await GetStorageLocationByIdAsync(id, ct), null, 201);
        }
        catch
        {
            await tx.RollbackAsync(ct);
            throw;
        }
    }

    public async Task<(StorageLocationDto? Location, string? Error, int StatusCode)> UpdateStorageLocationAsync(
        int id, StorageLocationDto loc, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(loc.Name))
            return (null, "Location name required", 400);

        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync(ct);
        await using var cmd = new SqlCommand("""
            UPDATE dbo.StorageLocations SET LocationName=@name, LocationType=@type, LocationCode=@code, ModifiedDate=GETDATE()
            OUTPUT INSERTED.LocationID, INSERTED.LocationCode, INSERTED.LocationName, INSERTED.LocationType
            WHERE LocationID=@id
            """, conn);
        cmd.Parameters.AddWithValue("@id", id);
        cmd.Parameters.AddWithValue("@name", loc.Name);
        cmd.Parameters.AddWithValue("@type", string.IsNullOrWhiteSpace(loc.Type) ? "Other" : loc.Type);
        cmd.Parameters.AddWithValue("@code", string.IsNullOrWhiteSpace(loc.Description) ? $"LOC-{id:D3}" : loc.Description);

        await using var r = await cmd.ExecuteReaderAsync(ct);
        if (!await r.ReadAsync(ct)) return (null, "Location not found", 404);
        var name = r.GetString(r.GetOrdinal("LocationName"));
        return (new StorageLocationDto
        {
            Id = r.GetInt32(r.GetOrdinal("LocationID")).ToString(),
            Name = name,
            Description = r.GetString(r.GetOrdinal("LocationCode")),
            Building = ExtractBuilding(name),
            Type = r.GetString(r.GetOrdinal("LocationType"))
        }, null, 200);
    }

    public async Task<(bool Deleted, string? Error, int StatusCode)> DeleteStorageLocationAsync(int id, CancellationToken ct = default)
    {
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync(ct);

        await using var check = new SqlCommand("SELECT COUNT(1) FROM dbo.StockItems WHERE LocationID = @id", conn);
        check.Parameters.AddWithValue("@id", id);
        if ((int)(await check.ExecuteScalarAsync(ct) ?? 0) > 0)
            return (false, "Location is in use by stock items", 409);

        await using var cmd = new SqlCommand("DELETE FROM dbo.StorageLocations WHERE LocationID = @id", conn);
        cmd.Parameters.AddWithValue("@id", id);
        var rows = await cmd.ExecuteNonQueryAsync(ct);
        return rows == 0 ? (false, "Location not found", 404) : (true, null, 200);
    }

    // ── Transactions ──────────────────────────────────────────────────

    public async Task<List<TransactionDto>> GetTransactionsAsync(CancellationToken ct = default)
    {
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync(ct);
        var users = await LoadUsersAsync(conn, ct);
        var locations = await LoadStorageLocationsAsync(conn, ct);
        var jobs = await LoadJobsAsync(conn, ct);
        var stock = await LoadStockAsync(conn, jobs, locations, ct);
        return await LoadTransactionsAsync(conn, stock, users, jobs, locations, ct);
    }

    public async Task<(TransactionDto? Transaction, string? Error, int StatusCode)> CreateTransactionAsync(
        TransactionDto tx, int performedByUserId, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(tx.StockNumber) && string.IsNullOrWhiteSpace(tx.StockItemId))
            return (null, "Stock reference required", 400);

        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync(ct);

        var stockId = await ResolveStockIdAsync(conn, tx.StockItemId, tx.StockNumber, ct);
        if (stockId == 0) return (null, "Stock item not found", 404);

        var toJobId = await ResolveJobIdByNumberAsync(conn, tx.TransferTo ?? tx.JobNumber, ct);
        var fromJobId = await ResolveJobIdByNumberAsync(conn, tx.TransferFrom, ct);
        var toLocId = await ResolveLocationIdByNameAsync(conn, tx.StorageLocation, ct);

        var qtyChange = TransactionTypeHelper.ComputeQuantityChange(tx.Type, tx.Quantity, tx.QtyBefore, tx.QtyAfter);
        var qtyAfter = tx.QtyAfter ?? 0;
        var qtyBefore = tx.QtyBefore ?? Math.Max(0, qtyAfter - qtyChange);
        var storedType = TransactionTypeHelper.Normalize(tx.Type);

        if (TransactionTypeHelper.RequiresComment(storedType) && string.IsNullOrWhiteSpace(tx.Comment))
            return (null, "Comment/reason is required for job transfers", 400);

        await using var cmd = new SqlCommand("""
            INSERT INTO dbo.StockTransactions
            (StockID, TransactionType, QuantityChange, QuantityBefore, QuantityAfter, FromJobID, ToJobID, FromLocationID, ToLocationID, PerformedByUserID, Notes, TransactionDate)
            OUTPUT INSERTED.TransactionID, INSERTED.TransactionDate
            VALUES (@stock, @type, @change, @before, @after, @fromJob, @toJob, NULL, @toLoc, @user, @notes, @date)
            """, conn);
        cmd.Parameters.AddWithValue("@stock", stockId);
        cmd.Parameters.AddWithValue("@type", storedType);
        cmd.Parameters.AddWithValue("@change", qtyChange);
        cmd.Parameters.AddWithValue("@before", qtyBefore);
        cmd.Parameters.AddWithValue("@after", qtyAfter);
        cmd.Parameters.AddWithValue("@fromJob", (object?)fromJobId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@toJob", (object?)toJobId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@toLoc", (object?)toLocId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@user", performedByUserId);
        cmd.Parameters.AddWithValue("@notes", (object?)tx.Comment ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@date", DateTime.TryParse(tx.Timestamp, out var dt) ? dt : DateTime.UtcNow);

        await using var r = await cmd.ExecuteReaderAsync(ct);
        if (!await r.ReadAsync(ct)) return (null, "Failed to create transaction", 500);

        tx.Id = r.GetInt32(r.GetOrdinal("TransactionID")).ToString();
        tx.StockItemId = stockId.ToString();
        tx.Type = storedType;
        tx.Timestamp = r.GetDateTime(r.GetOrdinal("TransactionDate")).ToString("o");
        return (tx, null, 201);
    }

    // ── Activity ──────────────────────────────────────────────────────

    public async Task<List<ActivityDto>> GetActivityAsync(CancellationToken ct = default)
    {
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync(ct);
        var users = await LoadUsersAsync(conn, ct);
        return await LoadActivityAsync(conn, users, ct);
    }

    public async Task<(ActivityDto? Activity, string? Error, int StatusCode)> CreateActivityAsync(
        ActivityDto activity, int? userId, CancellationToken ct = default)
    {
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync(ct);

        if (!userId.HasValue && !string.IsNullOrWhiteSpace(activity.UserName))
            userId = await ResolveUserIdByNameAsync(conn, activity.UserName, ct);

        await using var cmd = new SqlCommand("""
            INSERT INTO dbo.ActivityLog (UserID, ActivityType, ActionText, ActivityDate)
            OUTPUT INSERTED.ActivityID, INSERTED.ActivityDate
            VALUES (@user, @type, @text, @date)
            """, conn);
        cmd.Parameters.AddWithValue("@user", (object?)userId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@type", activity.ActionPerformed.ToLowerInvariant());
        cmd.Parameters.AddWithValue("@text", $"{activity.ScreenVisited}: {activity.ActivityDescription}");
        cmd.Parameters.AddWithValue("@date", DateTime.TryParse(activity.Timestamp, out var dt) ? dt : DateTime.UtcNow);

        await using var r = await cmd.ExecuteReaderAsync(ct);
        if (!await r.ReadAsync(ct)) return (null, "Failed to log activity", 500);
        activity.Id = r.GetInt32(r.GetOrdinal("ActivityID")).ToString();
        activity.Timestamp = r.GetDateTime(r.GetOrdinal("ActivityDate")).ToString("o");
        return (activity, null, 201);
    }

    // ── Settings ──────────────────────────────────────────────────────

    public async Task<Dictionary<string, object?>> GetSettingsAsync(CancellationToken ct = default)
    {
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync(ct);
        return await LoadSettingsAsync(conn, ct);
    }

    public async Task<Dictionary<string, object?>> UpdateSettingsAsync(
        Dictionary<string, object?> settings, CancellationToken ct = default)
    {
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync(ct);
        await using var tx = (SqlTransaction)await conn.BeginTransactionAsync(ct);
        try
        {
            await SyncSettingsAsync(conn, tx, settings, ct);
            await tx.CommitAsync(ct);
        }
        catch
        {
            await tx.RollbackAsync(ct);
            throw;
        }
        return await GetSettingsAsync(ct);
    }

    // ── Audits ────────────────────────────────────────────────────────

    public async Task<List<AuditDto>> GetAuditsAsync(CancellationToken ct = default)
    {
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync(ct);
        return await LoadAuditsAsync(conn, ct);
    }

    public async Task<(AuditDto? Audit, string? Error, int StatusCode)> CreateAuditAsync(AuditDto audit, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(audit.StockNumber))
            return (null, "Stock number required", 400);

        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync(ct);
        if (!await TableExistsAsync(conn, "InventoryAudits", ct))
            return (null, "InventoryAudits table not found — run script 06_EXTRA_TABLES.sql", 503);

        await using var cmd = new SqlCommand("""
            INSERT INTO dbo.InventoryAudits (AuditDate, StockNumber, PartDescription, SystemQty, AuditedQty, Result, AuditedBy)
            OUTPUT INSERTED.AuditID, INSERTED.AuditDate
            VALUES (@date, @stock, @desc, @sys, @aud, @result, @by)
            """, conn);
        cmd.Parameters.AddWithValue("@date", DateTime.TryParse(audit.AuditDate, out var dt) ? dt : DateTime.UtcNow);
        cmd.Parameters.AddWithValue("@stock", audit.StockNumber);
        cmd.Parameters.AddWithValue("@desc", (object?)audit.PartDescription ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@sys", audit.SystemQty);
        cmd.Parameters.AddWithValue("@aud", audit.AuditedQty);
        cmd.Parameters.AddWithValue("@result", audit.Result);
        cmd.Parameters.AddWithValue("@by", audit.AuditedBy);

        await using var r = await cmd.ExecuteReaderAsync(ct);
        if (!await r.ReadAsync(ct)) return (null, "Failed to create audit", 500);
        audit.Id = r.GetInt32(r.GetOrdinal("AuditID")).ToString();
        audit.AuditDate = r.GetDateTime(r.GetOrdinal("AuditDate")).ToString("o");
        return (audit, null, 201);
    }

    // ── Reconciliations ───────────────────────────────────────────────

    public async Task<List<ReconciliationDto>> GetReconciliationsAsync(CancellationToken ct = default)
    {
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync(ct);
        return await LoadReconciliationsAsync(conn, ct);
    }

    public async Task<(ReconciliationDto? Item, string? Error, int StatusCode)> CreateReconciliationAsync(
        ReconciliationDto item, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(item.StockNumber))
            return (null, "Stock number required", 400);

        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync(ct);
        if (!await TableExistsAsync(conn, "Reconciliations", ct))
            return (null, "Reconciliations table not found — run script 06_EXTRA_TABLES.sql", 503);

        await using var cmd = new SqlCommand("""
            INSERT INTO dbo.Reconciliations (StockNumber, PartDescription, SystemQty, PhysicalQty, Variance, Status, ReconciledAt)
            OUTPUT INSERTED.ReconciliationID, INSERTED.ReconciledAt
            VALUES (@stock, @desc, @sys, @phys, @var, @status, @date)
            """, conn);
        cmd.Parameters.AddWithValue("@stock", item.StockNumber);
        cmd.Parameters.AddWithValue("@desc", (object?)item.PartDescription ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@sys", item.SystemQty);
        cmd.Parameters.AddWithValue("@phys", item.PhysicalQty);
        cmd.Parameters.AddWithValue("@var", item.Variance);
        cmd.Parameters.AddWithValue("@status", string.IsNullOrWhiteSpace(item.Status) ? "Reconciled" : item.Status);
        cmd.Parameters.AddWithValue("@date", DateTime.TryParse(item.ReconciledAt ?? "", out var dt) ? dt : DateTime.UtcNow);

        await using var r = await cmd.ExecuteReaderAsync(ct);
        if (!await r.ReadAsync(ct)) return (null, "Failed to create reconciliation", 500);
        item.Id = r.GetInt32(r.GetOrdinal("ReconciliationID")).ToString();
        item.ReconciledAt = r.IsDBNull(r.GetOrdinal("ReconciledAt"))
            ? null
            : r.GetDateTime(r.GetOrdinal("ReconciledAt")).ToString("o");
        return (item, null, 201);
    }

    // ── ID resolution helpers ─────────────────────────────────────────

    private static async Task<int> ResolveStockIdAsync(SqlConnection conn, string? stockItemId, string? stockNumber, CancellationToken ct)
    {
        if (int.TryParse(stockItemId, out var id) && id > 0)
        {
            await using var cmd = new SqlCommand("SELECT 1 FROM dbo.StockItems WHERE StockID = @id", conn);
            cmd.Parameters.AddWithValue("@id", id);
            if (await cmd.ExecuteScalarAsync(ct) != null) return id;
        }
        if (!string.IsNullOrWhiteSpace(stockNumber))
        {
            await using var cmd = new SqlCommand("SELECT StockID FROM dbo.StockItems WHERE StockNumber = @num", conn);
            cmd.Parameters.AddWithValue("@num", stockNumber);
            var result = await cmd.ExecuteScalarAsync(ct);
            if (result != null) return Convert.ToInt32(result);
        }
        return 0;
    }

    private static async Task<int?> ResolveJobIdByNumberAsync(SqlConnection conn, string? jobNumber, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(jobNumber)) return null;
        await using var cmd = new SqlCommand("SELECT JobID FROM dbo.Jobs WHERE JobNumber = @num", conn);
        cmd.Parameters.AddWithValue("@num", jobNumber);
        var result = await cmd.ExecuteScalarAsync(ct);
        return result == null ? null : Convert.ToInt32(result);
    }

    private static async Task<int?> ResolveLocationIdByNameAsync(SqlConnection conn, string? name, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(name)) return null;
        await using var cmd = new SqlCommand("SELECT LocationID FROM dbo.StorageLocations WHERE LocationName = @name", conn);
        cmd.Parameters.AddWithValue("@name", name);
        var result = await cmd.ExecuteScalarAsync(ct);
        return result == null ? null : Convert.ToInt32(result);
    }

    private static async Task<int?> ResolveUserIdByNameAsync(SqlConnection conn, string userName, CancellationToken ct)
    {
        await using var cmd = new SqlCommand("SELECT UserID FROM dbo.Users WHERE FullName = @name", conn);
        cmd.Parameters.AddWithValue("@name", userName.Trim());
        var result = await cmd.ExecuteScalarAsync(ct);
        return result == null ? null : Convert.ToInt32(result);
    }
}
