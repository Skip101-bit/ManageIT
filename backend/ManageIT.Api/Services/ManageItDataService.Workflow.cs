using System.Text.Json;
using ManageIT.Api.Models;
using Microsoft.Data.SqlClient;

namespace ManageIT.Api.Services;

public sealed partial class ManageItDataService
{
    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true,
        WriteIndented = false
    };

    // ── Audit sessions (multi-count workflow) ─────────────────────────

    public async Task<List<AuditSessionDto>> GetAuditSessionsAsync(CancellationToken ct = default)
    {
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync(ct);
        if (!await TableExistsAsync(conn, "AuditSessions", ct))
            return [];
        return await LoadAuditSessionsAsync(conn, ct);
    }

    public async Task<(AuditSessionDto? Session, string? Error, int StatusCode)> UpsertAuditSessionAsync(
        AuditSessionDto session, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(session.Id))
            return (null, "Session id required", 400);

        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync(ct);
        if (!await TableExistsAsync(conn, "AuditSessions", ct))
            return (null, "Run SQL script 10_INVENTORY_PORTAL.sql to enable audit session storage", 503);

        var payload = JsonSerializer.Serialize(session, JsonOpts);
        await using var cmd = new SqlCommand("""
            MERGE dbo.AuditSessions AS t
            USING (SELECT @id AS SessionID) AS s ON t.SessionID = s.SessionID
            WHEN MATCHED THEN UPDATE SET
                SessionName = @name, Status = @status, CreatedBy = @by,
                PayloadJson = @json, UpdatedAt = GETDATE()
            WHEN NOT MATCHED THEN INSERT (SessionID, SessionName, Status, CreatedAt, CreatedBy, PayloadJson, UpdatedAt)
                VALUES (@id, @name, @status, @created, @by, @json, GETDATE());
            """, conn);
        cmd.Parameters.AddWithValue("@id", session.Id);
        cmd.Parameters.AddWithValue("@name", session.Name ?? "Audit");
        cmd.Parameters.AddWithValue("@status", session.Status ?? "count1_in_progress");
        cmd.Parameters.AddWithValue("@by", (object?)session.CreatedBy ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@json", payload);
        cmd.Parameters.AddWithValue("@created", DateTime.TryParse(session.CreatedAt, out var dt) ? dt : DateTime.UtcNow);
        await cmd.ExecuteNonQueryAsync(ct);
        return (session, null, 200);
    }

    public async Task<(bool Success, string? Error, int StatusCode)> DeleteAuditSessionAsync(
        string sessionId, CancellationToken ct = default)
    {
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync(ct);
        if (!await TableExistsAsync(conn, "AuditSessions", ct))
            return (false, "Audit sessions table not found", 404);

        await using var delRecon = new SqlCommand("DELETE FROM dbo.ReconHistoryRuns WHERE SessionID = @id", conn);
        delRecon.Parameters.AddWithValue("@id", sessionId);
        await delRecon.ExecuteNonQueryAsync(ct);

        await using var cmd = new SqlCommand("DELETE FROM dbo.AuditSessions WHERE SessionID = @id", conn);
        cmd.Parameters.AddWithValue("@id", sessionId);
        var rows = await cmd.ExecuteNonQueryAsync(ct);
        return rows == 0 ? (false, "Session not found", 404) : (true, null, 200);
    }

    // ── Reconciliation history runs ───────────────────────────────────

    public async Task<List<ReconReportDto>> GetReconHistoryAsync(CancellationToken ct = default)
    {
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync(ct);
        if (!await TableExistsAsync(conn, "ReconHistoryRuns", ct))
            return [];
        return await LoadReconHistoryAsync(conn, ct);
    }

    public async Task<(ReconReportDto? Run, string? Error, int StatusCode)> UpsertReconHistoryRunAsync(
        ReconReportDto run, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(run.Id))
            return (null, "Run id required", 400);

        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync(ct);
        if (!await TableExistsAsync(conn, "ReconHistoryRuns", ct))
            return (null, "Run SQL script 10_INVENTORY_PORTAL.sql to enable recon history storage", 503);

        var payload = JsonSerializer.Serialize(run, JsonOpts);
        await using var cmd = new SqlCommand("""
            MERGE dbo.ReconHistoryRuns AS t
            USING (SELECT @id AS RunID) AS s ON t.RunID = s.RunID
            WHEN MATCHED THEN UPDATE SET
                SessionID = @session, CountNumber = @count, RunBy = @by, Status = @status, PayloadJson = @json, RunAt = @runAt
            WHEN NOT MATCHED THEN INSERT (RunID, SessionID, CountNumber, RunAt, RunBy, Status, PayloadJson)
                VALUES (@id, @session, @count, @runAt, @by, @status, @json);
            """, conn);
        cmd.Parameters.AddWithValue("@id", run.Id);
        cmd.Parameters.AddWithValue("@session", run.SessionId ?? "");
        cmd.Parameters.AddWithValue("@count", run.CountNumber);
        cmd.Parameters.AddWithValue("@by", (object?)run.RunBy ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@status", run.Status ?? "complete");
        cmd.Parameters.AddWithValue("@json", payload);
        cmd.Parameters.AddWithValue("@runAt", DateTime.TryParse(run.RunAt, out var dt) ? dt : DateTime.UtcNow);
        await cmd.ExecuteNonQueryAsync(ct);
        return (run, null, 200);
    }

    // ── Serial numbers ────────────────────────────────────────────────

    public async Task<List<string>> GetSerialNumbersAsync(CancellationToken ct = default)
    {
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync(ct);
        if (!await TableExistsAsync(conn, "InventorySerialNumbers", ct))
            return [];
        var list = new List<string>();
        await using var cmd = new SqlCommand("SELECT SerialNumber FROM dbo.InventorySerialNumbers ORDER BY SerialNumber", conn);
        await using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct))
            list.Add(r.GetString(0));
        return list;
    }

    public async Task<(string? Serial, string? Error, int StatusCode)> AddSerialNumberAsync(
        string serialNumber, CancellationToken ct = default)
    {
        var sn = serialNumber?.Trim();
        if (string.IsNullOrWhiteSpace(sn))
            return (null, "Serial number required", 400);

        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync(ct);
        if (!await TableExistsAsync(conn, "InventorySerialNumbers", ct))
            return (null, "Run SQL script 10_INVENTORY_PORTAL.sql", 503);

        await using var cmd = new SqlCommand("""
            IF NOT EXISTS (SELECT 1 FROM dbo.InventorySerialNumbers WHERE SerialNumber = @sn)
                INSERT INTO dbo.InventorySerialNumbers (SerialNumber) VALUES (@sn);
            """, conn);
        cmd.Parameters.AddWithValue("@sn", sn);
        await cmd.ExecuteNonQueryAsync(ct);
        return (sn, null, 201);
    }

    // ── Load / sync helpers ───────────────────────────────────────────

    private async Task<List<AuditSessionDto>> LoadAuditSessionsAsync(SqlConnection conn, CancellationToken ct)
    {
        var list = new List<AuditSessionDto>();
        await using var cmd = new SqlCommand(
            "SELECT PayloadJson FROM dbo.AuditSessions ORDER BY CreatedAt DESC", conn);
        await using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct))
        {
            var json = r.GetString(0);
            var session = JsonSerializer.Deserialize<AuditSessionDto>(json, JsonOpts);
            if (session != null) list.Add(session);
        }
        return list;
    }

    private async Task<List<ReconReportDto>> LoadReconHistoryAsync(SqlConnection conn, CancellationToken ct)
    {
        var list = new List<ReconReportDto>();
        await using var cmd = new SqlCommand(
            "SELECT PayloadJson FROM dbo.ReconHistoryRuns ORDER BY RunAt DESC", conn);
        await using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct))
        {
            var json = r.GetString(0);
            var run = JsonSerializer.Deserialize<ReconReportDto>(json, JsonOpts);
            if (run != null) list.Add(run);
        }
        return list;
    }

    private async Task SyncAuditSessionsAsync(
        SqlConnection conn, SqlTransaction tx, List<AuditSessionDto> sessions, CancellationToken ct)
    {
        if (!await TableExistsAsync(conn, "AuditSessions", ct, tx)) return;

        await using var clear = new SqlCommand("DELETE FROM dbo.AuditSessions", conn, tx);
        await clear.ExecuteNonQueryAsync(ct);

        foreach (var session in sessions)
        {
            if (string.IsNullOrWhiteSpace(session.Id)) continue;
            var payload = JsonSerializer.Serialize(session, JsonOpts);
            await using var cmd = new SqlCommand("""
                INSERT INTO dbo.AuditSessions (SessionID, SessionName, Status, CreatedAt, CreatedBy, PayloadJson, UpdatedAt)
                VALUES (@id, @name, @status, @created, @by, @json, GETDATE())
                """, conn, tx);
            cmd.Parameters.AddWithValue("@id", session.Id);
            cmd.Parameters.AddWithValue("@name", session.Name ?? "Audit");
            cmd.Parameters.AddWithValue("@status", session.Status ?? "count1_in_progress");
            cmd.Parameters.AddWithValue("@created", DateTime.TryParse(session.CreatedAt, out var dt) ? dt : DateTime.UtcNow);
            cmd.Parameters.AddWithValue("@by", (object?)session.CreatedBy ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@json", payload);
            await cmd.ExecuteNonQueryAsync(ct);
        }
    }

    private async Task SyncReconHistoryAsync(
        SqlConnection conn, SqlTransaction tx, List<ReconReportDto> runs, CancellationToken ct)
    {
        if (!await TableExistsAsync(conn, "ReconHistoryRuns", ct, tx)) return;

        await using var clear = new SqlCommand("DELETE FROM dbo.ReconHistoryRuns", conn, tx);
        await clear.ExecuteNonQueryAsync(ct);

        foreach (var run in runs)
        {
            if (string.IsNullOrWhiteSpace(run.Id)) continue;
            var payload = JsonSerializer.Serialize(run, JsonOpts);
            await using var cmd = new SqlCommand("""
                INSERT INTO dbo.ReconHistoryRuns (RunID, SessionID, CountNumber, RunAt, RunBy, Status, PayloadJson)
                VALUES (@id, @session, @count, @runAt, @by, @status, @json)
                """, conn, tx);
            cmd.Parameters.AddWithValue("@id", run.Id);
            cmd.Parameters.AddWithValue("@session", run.SessionId ?? "");
            cmd.Parameters.AddWithValue("@count", run.CountNumber);
            cmd.Parameters.AddWithValue("@by", (object?)run.RunBy ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@status", run.Status ?? "complete");
            cmd.Parameters.AddWithValue("@json", payload);
            cmd.Parameters.AddWithValue("@runAt", DateTime.TryParse(run.RunAt, out var dt) ? dt : DateTime.UtcNow);
            await cmd.ExecuteNonQueryAsync(ct);
        }
    }

    private async Task SyncSerialNumbersAsync(
        SqlConnection conn, SqlTransaction tx, List<string> serials, CancellationToken ct)
    {
        if (!await TableExistsAsync(conn, "InventorySerialNumbers", ct, tx)) return;

        await using var clear = new SqlCommand("DELETE FROM dbo.InventorySerialNumbers", conn, tx);
        await clear.ExecuteNonQueryAsync(ct);

        foreach (var sn in serials.Where(s => !string.IsNullOrWhiteSpace(s)).Distinct(StringComparer.OrdinalIgnoreCase))
        {
            await using var cmd = new SqlCommand(
                "INSERT INTO dbo.InventorySerialNumbers (SerialNumber) VALUES (@sn)", conn, tx);
            cmd.Parameters.AddWithValue("@sn", sn.Trim());
            await cmd.ExecuteNonQueryAsync(ct);
        }
    }

    private async Task<List<PendingApprovalDto>> LoadPendingApprovalsAsync(SqlConnection conn, CancellationToken ct)
    {
        if (!await TableExistsAsync(conn, "PendingApprovals", ct))
            return [];

        var list = new List<PendingApprovalDto>();
        await using var cmd = new SqlCommand("""
            SELECT ApprovalID, ApprovalType, Status, StockNumber, Description, QuantityChange,
                   PayloadJson, RequestedByUserID, RequestedAt
            FROM dbo.PendingApprovals ORDER BY RequestedAt DESC
            """, conn);
        await using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct))
        {
            list.Add(new PendingApprovalDto
            {
                Id = r.GetInt32(r.GetOrdinal("ApprovalID")).ToString(),
                Type = r.GetString(r.GetOrdinal("ApprovalType")),
                Status = r.GetString(r.GetOrdinal("Status")),
                StockNumber = r.IsDBNull(r.GetOrdinal("StockNumber")) ? "" : r.GetString(r.GetOrdinal("StockNumber")),
                Description = r.IsDBNull(r.GetOrdinal("Description")) ? "" : r.GetString(r.GetOrdinal("Description")),
                QuantityChange = r.IsDBNull(r.GetOrdinal("QuantityChange")) ? 0 : r.GetInt32(r.GetOrdinal("QuantityChange")),
                PayloadJson = r.IsDBNull(r.GetOrdinal("PayloadJson")) ? null : r.GetString(r.GetOrdinal("PayloadJson")),
                RequestedBy = r.IsDBNull(r.GetOrdinal("RequestedByUserID")) ? "" : r.GetInt32(r.GetOrdinal("RequestedByUserID")).ToString(),
                RequestedAt = r.GetDateTime(r.GetOrdinal("RequestedAt")).ToString("o")
            });
        }
        return list;
    }

    private async Task SyncPendingApprovalsAsync(
        SqlConnection conn, SqlTransaction tx, List<PendingApprovalDto> items, CancellationToken ct)
    {
        if (!await TableExistsAsync(conn, "PendingApprovals", ct, tx)) return;

        await using var clear = new SqlCommand("DELETE FROM dbo.PendingApprovals", conn, tx);
        await clear.ExecuteNonQueryAsync(ct);

        foreach (var p in items)
        {
            await using var cmd = new SqlCommand("""
                INSERT INTO dbo.PendingApprovals (ApprovalType, Status, StockNumber, Description, QuantityChange, PayloadJson, RequestedAt)
                VALUES (@type, @status, @stock, @desc, @qty, @payload, @at)
                """, conn, tx);
            cmd.Parameters.AddWithValue("@type", p.Type ?? "Adjustment");
            cmd.Parameters.AddWithValue("@status", p.Status ?? "Pending");
            cmd.Parameters.AddWithValue("@stock", (object?)p.StockNumber ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@desc", (object?)p.Description ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@qty", p.QuantityChange);
            cmd.Parameters.AddWithValue("@payload", (object?)p.PayloadJson ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@at", DateTime.TryParse(p.RequestedAt, out var dt) ? dt : DateTime.UtcNow);
            await cmd.ExecuteNonQueryAsync(ct);
        }
    }

    private async Task<List<string>> LoadSerialNumbersAsync(SqlConnection conn, CancellationToken ct)
    {
        if (!await TableExistsAsync(conn, "InventorySerialNumbers", ct))
            return [];
        var list = new List<string>();
        await using var cmd = new SqlCommand("SELECT SerialNumber FROM dbo.InventorySerialNumbers ORDER BY SerialNumber", conn);
        await using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct))
            list.Add(r.GetString(0));
        return list;
    }
}
