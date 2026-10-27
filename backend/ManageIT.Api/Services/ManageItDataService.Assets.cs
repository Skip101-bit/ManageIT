using ManageIT.Api.Models;
using Microsoft.Data.SqlClient;

namespace ManageIT.Api.Services;

public sealed partial class ManageItDataService
{
    private const string AssetsSelectSql = """
        SELECT a.AssetID, a.AssetNumber, a.AssetName, a.Description, a.Category, a.SubCategory,
               a.Manufacturer, a.Model, a.SerialNumber, a.AssetTag, a.Status, a.Condition,
               a.Department, a.PurchaseDate, a.PurchaseCost, a.CurrentValue, a.WarrantyExpiry,
               a.InsuranceExpiry, a.LastInspectionDate, a.NextInspectionDue, a.MaintenanceIntervalDays,
               a.DepreciationYears, a.Notes, a.CreatedDate, a.ModifiedDate,
               l.LocationName, j.JobNumber, u.FullName AS AssignedUserName
        FROM dbo.Assets a
        LEFT JOIN dbo.StorageLocations l ON l.LocationID = a.LocationID
        LEFT JOIN dbo.Jobs j ON j.JobID = a.JobID
        LEFT JOIN dbo.Users u ON u.UserID = a.AssignedUserID
        """;

    public async Task<List<AssetDto>> GetAssetsAsync(CancellationToken ct = default)
    {
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync(ct);
        return await LoadAssetsAsync(conn, ct);
    }

    public async Task<AssetDto?> GetAssetByIdAsync(int id, CancellationToken ct = default)
    {
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync(ct);
        if (!await TableExistsAsync(conn, "Assets", ct)) return null;

        await using var cmd = new SqlCommand(AssetsSelectSql + " WHERE a.AssetID = @id", conn);
        cmd.Parameters.AddWithValue("@id", id);
        await using var r = await cmd.ExecuteReaderAsync(ct);
        return await r.ReadAsync(ct) ? MapAssetRow(r) : null;
    }

    public async Task<(AssetDto? Asset, string? Error, int StatusCode)> CreateAssetAsync(AssetDto asset, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(asset.AssetNumber) || string.IsNullOrWhiteSpace(asset.AssetName))
            return (null, "Asset number and name required", 400);

        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync(ct);
        if (!await TableExistsAsync(conn, "Assets", ct))
            return (null, "Assets table not found — run script 11_ASSET_MANAGEMENT.sql", 503);

        if (await AssetNumberExistsAsync(conn, asset.AssetNumber, null, ct))
            return (null, "Asset number already exists", 409);

        var locId = await ResolveLocationIdByNameAsync(conn, asset.StorageLocation, ct);
        var jobId = await ResolveJobIdByNumberAsync(conn, asset.JobNumber, ct);
        var userId = await ResolveUserIdByNameAsync(conn, asset.AssignedTo, ct);

        await using var cmd = new SqlCommand("""
            INSERT INTO dbo.Assets
            (AssetNumber, AssetName, Description, Category, SubCategory, Manufacturer, Model, SerialNumber, AssetTag,
             Status, Condition, LocationID, JobID, AssignedUserID, Department, PurchaseDate, PurchaseCost, CurrentValue,
             WarrantyExpiry, InsuranceExpiry, LastInspectionDate, NextInspectionDue, MaintenanceIntervalDays, DepreciationYears, Notes)
            OUTPUT INSERTED.AssetID
            VALUES
            (@num, @name, @desc, @cat, @sub, @mfr, @model, @serial, @tag, @status, @cond, @loc, @job, @user, @dept,
             @purchase, @cost, @value, @warranty, @insurance, @lastInsp, @nextInsp, @maintDays, @deprYears, @notes)
            """, conn);
        BindAssetParams(cmd, asset, locId, jobId, userId);

        var id = Convert.ToInt32(await cmd.ExecuteScalarAsync(ct));
        return (await GetAssetByIdAsync(id, ct), null, 201);
    }

    public async Task<(AssetDto? Asset, string? Error, int StatusCode)> UpdateAssetAsync(int id, AssetDto asset, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(asset.AssetNumber) || string.IsNullOrWhiteSpace(asset.AssetName))
            return (null, "Asset number and name required", 400);

        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync(ct);
        if (!await TableExistsAsync(conn, "Assets", ct))
            return (null, "Assets table not found — run script 11_ASSET_MANAGEMENT.sql", 503);

        if (await AssetNumberExistsAsync(conn, asset.AssetNumber, id, ct))
            return (null, "Asset number already exists", 409);

        var locId = await ResolveLocationIdByNameAsync(conn, asset.StorageLocation, ct);
        var jobId = await ResolveJobIdByNumberAsync(conn, asset.JobNumber, ct);
        var userId = await ResolveUserIdByNameAsync(conn, asset.AssignedTo, ct);

        await using var cmd = new SqlCommand("""
            UPDATE dbo.Assets SET
              AssetNumber=@num, AssetName=@name, Description=@desc, Category=@cat, SubCategory=@sub,
              Manufacturer=@mfr, Model=@model, SerialNumber=@serial, AssetTag=@tag, Status=@status, Condition=@cond,
              LocationID=@loc, JobID=@job, AssignedUserID=@user, Department=@dept, PurchaseDate=@purchase,
              PurchaseCost=@cost, CurrentValue=@value, WarrantyExpiry=@warranty, InsuranceExpiry=@insurance,
              LastInspectionDate=@lastInsp, NextInspectionDue=@nextInsp, MaintenanceIntervalDays=@maintDays,
              DepreciationYears=@deprYears, Notes=@notes, ModifiedDate=GETDATE()
            WHERE AssetID=@id
            """, conn);
        cmd.Parameters.AddWithValue("@id", id);
        BindAssetParams(cmd, asset, locId, jobId, userId);
        var rows = await cmd.ExecuteNonQueryAsync(ct);
        return rows == 0 ? (null, "Asset not found", 404) : (await GetAssetByIdAsync(id, ct), null, 200);
    }

    public async Task<(bool Deleted, string? Error, int StatusCode)> DeleteAssetAsync(int id, CancellationToken ct = default)
    {
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync(ct);
        if (!await TableExistsAsync(conn, "Assets", ct))
            return (false, "Assets table not found", 503);

        await using var cmd = new SqlCommand("DELETE FROM dbo.Assets WHERE AssetID = @id", conn);
        cmd.Parameters.AddWithValue("@id", id);
        var rows = await cmd.ExecuteNonQueryAsync(ct);
        return rows == 0 ? (false, "Asset not found", 404) : (true, null, 200);
    }

    public async Task<List<AssetMaintenanceDto>> GetAssetMaintenanceAsync(CancellationToken ct = default)
    {
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync(ct);
        return await LoadAssetMaintenanceAsync(conn, ct);
    }

    public async Task<(AssetMaintenanceDto? Item, string? Error, int StatusCode)> CreateAssetMaintenanceAsync(
        AssetMaintenanceDto item, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(item.AssetId) && string.IsNullOrWhiteSpace(item.AssetNumber))
            return (null, "Asset reference required", 400);

        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync(ct);
        if (!await TableExistsAsync(conn, "AssetMaintenance", ct))
            return (null, "AssetMaintenance table not found — run script 11_ASSET_MANAGEMENT.sql", 503);

        var assetId = await ResolveAssetIdAsync(conn, item.AssetId, item.AssetNumber, ct);
        if (assetId == 0) return (null, "Asset not found", 404);

        await using var cmd = new SqlCommand("""
            INSERT INTO dbo.AssetMaintenance
            (AssetID, MaintenanceType, Status, ScheduledDate, CompletedDate, PerformedBy, Vendor, Cost,
             Description, PartsUsed, NextDueDate, Notes)
            OUTPUT INSERTED.MaintenanceID
            VALUES (@asset, @type, @status, @sched, @done, @by, @vendor, @cost, @desc, @parts, @next, @notes)
            """, conn);
        BindMaintenanceParams(cmd, item, assetId);

        var id = Convert.ToInt32(await cmd.ExecuteScalarAsync(ct));
        return (await GetAssetMaintenanceByIdAsync(id, ct), null, 201);
    }

    public async Task<(AssetMaintenanceDto? Item, string? Error, int StatusCode)> UpdateAssetMaintenanceAsync(
        int id, AssetMaintenanceDto item, CancellationToken ct = default)
    {
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync(ct);
        if (!await TableExistsAsync(conn, "AssetMaintenance", ct))
            return (null, "AssetMaintenance table not found", 503);

        var assetId = await ResolveAssetIdAsync(conn, item.AssetId, item.AssetNumber, ct);
        if (assetId == 0) return (null, "Asset not found", 404);

        await using var cmd = new SqlCommand("""
            UPDATE dbo.AssetMaintenance SET
              AssetID=@asset, MaintenanceType=@type, Status=@status, ScheduledDate=@sched, CompletedDate=@done,
              PerformedBy=@by, Vendor=@vendor, Cost=@cost, Description=@desc, PartsUsed=@parts,
              NextDueDate=@next, Notes=@notes, ModifiedDate=GETDATE()
            WHERE MaintenanceID=@id
            """, conn);
        cmd.Parameters.AddWithValue("@id", id);
        BindMaintenanceParams(cmd, item, assetId);
        var rows = await cmd.ExecuteNonQueryAsync(ct);
        return rows == 0 ? (null, "Maintenance record not found", 404) : (await GetAssetMaintenanceByIdAsync(id, ct), null, 200);
    }

    public async Task<(bool Deleted, string? Error, int StatusCode)> DeleteAssetMaintenanceAsync(int id, CancellationToken ct = default)
    {
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync(ct);
        if (!await TableExistsAsync(conn, "AssetMaintenance", ct))
            return (false, "AssetMaintenance table not found", 503);

        await using var cmd = new SqlCommand("DELETE FROM dbo.AssetMaintenance WHERE MaintenanceID = @id", conn);
        cmd.Parameters.AddWithValue("@id", id);
        var rows = await cmd.ExecuteNonQueryAsync(ct);
        return rows == 0 ? (false, "Maintenance record not found", 404) : (true, null, 200);
    }

    private async Task<AssetMaintenanceDto?> GetAssetMaintenanceByIdAsync(int id, CancellationToken ct)
    {
        await using var conn = new SqlConnection(_connectionString);
        await conn.OpenAsync(ct);
        const string sql = """
            SELECT m.MaintenanceID, m.AssetID, m.MaintenanceType, m.Status, m.ScheduledDate, m.CompletedDate,
                   m.PerformedBy, m.Vendor, m.Cost, m.Description, m.PartsUsed, m.NextDueDate, m.Notes, m.CreatedDate,
                   a.AssetNumber, a.AssetName
            FROM dbo.AssetMaintenance m
            INNER JOIN dbo.Assets a ON a.AssetID = m.AssetID
            WHERE m.MaintenanceID = @id
            """;
        await using var cmd = new SqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("@id", id);
        await using var r = await cmd.ExecuteReaderAsync(ct);
        return await r.ReadAsync(ct) ? MapMaintenanceRow(r) : null;
    }

    private async Task<List<AssetDto>> LoadAssetsAsync(SqlConnection conn, CancellationToken ct)
    {
        var list = new List<AssetDto>();
        if (!await TableExistsAsync(conn, "Assets", ct)) return list;

        await using var cmd = new SqlCommand(AssetsSelectSql + " ORDER BY a.AssetNumber", conn);
        await using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct)) list.Add(MapAssetRow(r));
        return list;
    }

    private async Task<List<AssetMaintenanceDto>> LoadAssetMaintenanceAsync(SqlConnection conn, CancellationToken ct)
    {
        var list = new List<AssetMaintenanceDto>();
        if (!await TableExistsAsync(conn, "AssetMaintenance", ct)) return list;

        const string sql = """
            SELECT m.MaintenanceID, m.AssetID, m.MaintenanceType, m.Status, m.ScheduledDate, m.CompletedDate,
                   m.PerformedBy, m.Vendor, m.Cost, m.Description, m.PartsUsed, m.NextDueDate, m.Notes, m.CreatedDate,
                   a.AssetNumber, a.AssetName
            FROM dbo.AssetMaintenance m
            INNER JOIN dbo.Assets a ON a.AssetID = m.AssetID
            ORDER BY m.ScheduledDate DESC, m.MaintenanceID DESC
            """;
        await using var cmd = new SqlCommand(sql, conn);
        await using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct)) list.Add(MapMaintenanceRow(r));
        return list;
    }

    private async Task SyncAssetsAsync(SqlConnection conn, SqlTransaction tx, List<AssetDto> assets, CancellationToken ct)
    {
        if (!await TableExistsAsync(conn, "Assets", ct, tx)) return;

        var existing = new HashSet<int>();
        await using (var cmd = new SqlCommand("SELECT AssetID FROM dbo.Assets", conn, tx))
        await using (var r = await cmd.ExecuteReaderAsync(ct))
            while (await r.ReadAsync(ct)) existing.Add(r.GetInt32(0));

        var incoming = new HashSet<int>();
        foreach (var a in assets)
        {
            var locId = await ResolveLocationIdByNameAsync(conn, a.StorageLocation, ct);
            var jobId = await ResolveJobIdByNumberAsync(conn, a.JobNumber, ct);
            var userId = await ResolveUserIdByNameAsync(conn, a.AssignedTo, ct);

            if (!int.TryParse(a.Id, out var id) || id <= 0)
            {
                id = await InsertAssetAsync(conn, tx, a, locId, jobId, userId, ct);
                a.Id = id.ToString();
            }
            else
            {
                incoming.Add(id);
                await using var cmd = new SqlCommand("""
                    UPDATE dbo.Assets SET AssetNumber=@num, AssetName=@name, Description=@desc, Category=@cat,
                    SubCategory=@sub, Manufacturer=@mfr, Model=@model, SerialNumber=@serial, AssetTag=@tag,
                    Status=@status, Condition=@cond, LocationID=@loc, JobID=@job, AssignedUserID=@user,
                    Department=@dept, PurchaseDate=@purchase, PurchaseCost=@cost, CurrentValue=@value,
                    WarrantyExpiry=@warranty, InsuranceExpiry=@insurance, LastInspectionDate=@lastInsp,
                    NextInspectionDue=@nextInsp, MaintenanceIntervalDays=@maintDays, DepreciationYears=@deprYears,
                    Notes=@notes, ModifiedDate=GETDATE() WHERE AssetID=@id
                    """, conn, tx);
                cmd.Parameters.AddWithValue("@id", id);
                BindAssetParams(cmd, a, locId, jobId, userId);
                await cmd.ExecuteNonQueryAsync(ct);
            }
        }

        foreach (var id in existing.Except(incoming))
        {
            await using var del = new SqlCommand("DELETE FROM dbo.Assets WHERE AssetID = @id", conn, tx);
            del.Parameters.AddWithValue("@id", id);
            await del.ExecuteNonQueryAsync(ct);
        }
    }

    private async Task SyncAssetMaintenanceAsync(SqlConnection conn, SqlTransaction tx, List<AssetMaintenanceDto> items, CancellationToken ct)
    {
        if (!await TableExistsAsync(conn, "AssetMaintenance", ct, tx)) return;

        var existing = new HashSet<int>();
        await using (var cmd = new SqlCommand("SELECT MaintenanceID FROM dbo.AssetMaintenance", conn, tx))
        await using (var r = await cmd.ExecuteReaderAsync(ct))
            while (await r.ReadAsync(ct)) existing.Add(r.GetInt32(0));

        var incoming = new HashSet<int>();
        foreach (var m in items)
        {
            var assetId = await ResolveAssetIdAsync(conn, m.AssetId, m.AssetNumber, ct);
            if (assetId == 0) continue;

            if (!int.TryParse(m.Id, out var id) || id <= 0)
            {
                id = await InsertAssetMaintenanceAsync(conn, tx, m, assetId, ct);
                m.Id = id.ToString();
                m.AssetId = assetId.ToString();
            }
            else
            {
                incoming.Add(id);
                await using var cmd = new SqlCommand("""
                    UPDATE dbo.AssetMaintenance SET AssetID=@asset, MaintenanceType=@type, Status=@status,
                    ScheduledDate=@sched, CompletedDate=@done, PerformedBy=@by, Vendor=@vendor, Cost=@cost,
                    Description=@desc, PartsUsed=@parts, NextDueDate=@next, Notes=@notes, ModifiedDate=GETDATE()
                    WHERE MaintenanceID=@id
                    """, conn, tx);
                cmd.Parameters.AddWithValue("@id", id);
                BindMaintenanceParams(cmd, m, assetId);
                await cmd.ExecuteNonQueryAsync(ct);
            }
        }

        foreach (var id in existing.Except(incoming))
        {
            await using var del = new SqlCommand("DELETE FROM dbo.AssetMaintenance WHERE MaintenanceID = @id", conn, tx);
            del.Parameters.AddWithValue("@id", id);
            await del.ExecuteNonQueryAsync(ct);
        }
    }

    private async Task<int> InsertAssetAsync(SqlConnection conn, SqlTransaction tx, AssetDto asset,
        int? locId, int? jobId, int? userId, CancellationToken ct)
    {
        await using var cmd = new SqlCommand("""
            INSERT INTO dbo.Assets
            (AssetNumber, AssetName, Description, Category, SubCategory, Manufacturer, Model, SerialNumber, AssetTag,
             Status, Condition, LocationID, JobID, AssignedUserID, Department, PurchaseDate, PurchaseCost, CurrentValue,
             WarrantyExpiry, InsuranceExpiry, LastInspectionDate, NextInspectionDue, MaintenanceIntervalDays, DepreciationYears, Notes)
            OUTPUT INSERTED.AssetID
            VALUES
            (@num, @name, @desc, @cat, @sub, @mfr, @model, @serial, @tag, @status, @cond, @loc, @job, @user, @dept,
             @purchase, @cost, @value, @warranty, @insurance, @lastInsp, @nextInsp, @maintDays, @deprYears, @notes)
            """, conn, tx);
        BindAssetParams(cmd, asset, locId, jobId, userId);
        return Convert.ToInt32(await cmd.ExecuteScalarAsync(ct));
    }

    private async Task<int> InsertAssetMaintenanceAsync(SqlConnection conn, SqlTransaction tx, AssetMaintenanceDto item,
        int assetId, CancellationToken ct)
    {
        await using var cmd = new SqlCommand("""
            INSERT INTO dbo.AssetMaintenance
            (AssetID, MaintenanceType, Status, ScheduledDate, CompletedDate, PerformedBy, Vendor, Cost,
             Description, PartsUsed, NextDueDate, Notes)
            OUTPUT INSERTED.MaintenanceID
            VALUES (@asset, @type, @status, @sched, @done, @by, @vendor, @cost, @desc, @parts, @next, @notes)
            """, conn, tx);
        BindMaintenanceParams(cmd, item, assetId);
        return Convert.ToInt32(await cmd.ExecuteScalarAsync(ct));
    }

    private static async Task<bool> AssetNumberExistsAsync(SqlConnection conn, string number, int? excludeId, CancellationToken ct)
    {
        await using var cmd = new SqlCommand(
            excludeId.HasValue
                ? "SELECT 1 FROM dbo.Assets WHERE AssetNumber = @num AND AssetID <> @id"
                : "SELECT 1 FROM dbo.Assets WHERE AssetNumber = @num", conn);
        cmd.Parameters.AddWithValue("@num", number);
        if (excludeId.HasValue) cmd.Parameters.AddWithValue("@id", excludeId.Value);
        return await cmd.ExecuteScalarAsync(ct) != null;
    }

    private static async Task<int> ResolveAssetIdAsync(SqlConnection conn, string? assetId, string? assetNumber, CancellationToken ct)
    {
        if (int.TryParse(assetId, out var id) && id > 0)
        {
            await using var cmd = new SqlCommand("SELECT 1 FROM dbo.Assets WHERE AssetID = @id", conn);
            cmd.Parameters.AddWithValue("@id", id);
            if (await cmd.ExecuteScalarAsync(ct) != null) return id;
        }
        if (!string.IsNullOrWhiteSpace(assetNumber))
        {
            await using var cmd = new SqlCommand("SELECT AssetID FROM dbo.Assets WHERE AssetNumber = @num", conn);
            cmd.Parameters.AddWithValue("@num", assetNumber);
            var result = await cmd.ExecuteScalarAsync(ct);
            if (result != null) return Convert.ToInt32(result);
        }
        return 0;
    }

    private static void BindAssetParams(SqlCommand cmd, AssetDto a, int? locId, int? jobId, int? userId)
    {
        cmd.Parameters.AddWithValue("@num", a.AssetNumber);
        cmd.Parameters.AddWithValue("@name", a.AssetName);
        cmd.Parameters.AddWithValue("@desc", (object?)a.Description ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@cat", (object?)a.Category ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@sub", (object?)a.SubCategory ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@mfr", (object?)a.Manufacturer ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@model", (object?)a.Model ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@serial", (object?)a.SerialNumber ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@tag", (object?)a.AssetTag ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@status", string.IsNullOrWhiteSpace(a.Status) ? "Active" : a.Status);
        cmd.Parameters.AddWithValue("@cond", (object?)a.Condition ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@loc", (object?)locId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@job", (object?)jobId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@user", (object?)userId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@dept", (object?)a.Department ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@purchase", ParseDateParam(a.PurchaseDate));
        cmd.Parameters.AddWithValue("@cost", (object?)a.PurchaseCost ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@value", (object?)a.CurrentValue ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@warranty", ParseDateParam(a.WarrantyExpiry));
        cmd.Parameters.AddWithValue("@insurance", ParseDateParam(a.InsuranceExpiry));
        cmd.Parameters.AddWithValue("@lastInsp", ParseDateParam(a.LastInspectionDate));
        cmd.Parameters.AddWithValue("@nextInsp", ParseDateParam(a.NextInspectionDue));
        cmd.Parameters.AddWithValue("@maintDays", (object?)a.MaintenanceIntervalDays ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@deprYears", (object?)a.DepreciationYears ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@notes", (object?)a.Notes ?? DBNull.Value);
    }

    private static void BindMaintenanceParams(SqlCommand cmd, AssetMaintenanceDto m, int assetId)
    {
        cmd.Parameters.AddWithValue("@asset", assetId);
        cmd.Parameters.AddWithValue("@type", string.IsNullOrWhiteSpace(m.MaintenanceType) ? "Preventive" : m.MaintenanceType);
        cmd.Parameters.AddWithValue("@status", string.IsNullOrWhiteSpace(m.Status) ? "Scheduled" : m.Status);
        cmd.Parameters.AddWithValue("@sched", ParseDateParam(m.ScheduledDate));
        cmd.Parameters.AddWithValue("@done", ParseDateParam(m.CompletedDate));
        cmd.Parameters.AddWithValue("@by", (object?)m.PerformedBy ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@vendor", (object?)m.Vendor ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@cost", (object?)m.Cost ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@desc", (object?)m.Description ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@parts", (object?)m.PartsUsed ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@next", ParseDateParam(m.NextDueDate));
        cmd.Parameters.AddWithValue("@notes", (object?)m.Notes ?? DBNull.Value);
    }

    private static object ParseDateParam(string? iso)
    {
        if (string.IsNullOrWhiteSpace(iso)) return DBNull.Value;
        return DateTime.TryParse(iso, out var dt) ? dt.Date : DBNull.Value;
    }

    private static AssetDto MapAssetRow(SqlDataReader r)
    {
        return new AssetDto
        {
            Id = r.GetInt32(r.GetOrdinal("AssetID")).ToString(),
            AssetNumber = r.GetString(r.GetOrdinal("AssetNumber")),
            AssetName = r.GetString(r.GetOrdinal("AssetName")),
            Description = r.IsDBNull(r.GetOrdinal("Description")) ? "" : r.GetString(r.GetOrdinal("Description")),
            Category = r.IsDBNull(r.GetOrdinal("Category")) ? "" : r.GetString(r.GetOrdinal("Category")),
            SubCategory = r.IsDBNull(r.GetOrdinal("SubCategory")) ? "" : r.GetString(r.GetOrdinal("SubCategory")),
            Manufacturer = r.IsDBNull(r.GetOrdinal("Manufacturer")) ? "" : r.GetString(r.GetOrdinal("Manufacturer")),
            Model = r.IsDBNull(r.GetOrdinal("Model")) ? "" : r.GetString(r.GetOrdinal("Model")),
            SerialNumber = r.IsDBNull(r.GetOrdinal("SerialNumber")) ? "" : r.GetString(r.GetOrdinal("SerialNumber")),
            AssetTag = r.IsDBNull(r.GetOrdinal("AssetTag")) ? "" : r.GetString(r.GetOrdinal("AssetTag")),
            Status = r.GetString(r.GetOrdinal("Status")),
            Condition = r.IsDBNull(r.GetOrdinal("Condition")) ? "" : r.GetString(r.GetOrdinal("Condition")),
            StorageLocation = HasColumn(r, "LocationName") && !r.IsDBNull(r.GetOrdinal("LocationName"))
                ? r.GetString(r.GetOrdinal("LocationName")) : "",
            JobNumber = HasColumn(r, "JobNumber") && !r.IsDBNull(r.GetOrdinal("JobNumber"))
                ? r.GetString(r.GetOrdinal("JobNumber")) : "",
            AssignedTo = HasColumn(r, "AssignedUserName") && !r.IsDBNull(r.GetOrdinal("AssignedUserName"))
                ? r.GetString(r.GetOrdinal("AssignedUserName")) : "",
            Department = r.IsDBNull(r.GetOrdinal("Department")) ? "" : r.GetString(r.GetOrdinal("Department")),
            PurchaseDate = ReadDate(r, "PurchaseDate"),
            PurchaseCost = r.IsDBNull(r.GetOrdinal("PurchaseCost")) ? null : r.GetDecimal(r.GetOrdinal("PurchaseCost")),
            CurrentValue = r.IsDBNull(r.GetOrdinal("CurrentValue")) ? null : r.GetDecimal(r.GetOrdinal("CurrentValue")),
            WarrantyExpiry = ReadDate(r, "WarrantyExpiry"),
            InsuranceExpiry = ReadDate(r, "InsuranceExpiry"),
            LastInspectionDate = ReadDate(r, "LastInspectionDate"),
            NextInspectionDue = ReadDate(r, "NextInspectionDue"),
            MaintenanceIntervalDays = r.IsDBNull(r.GetOrdinal("MaintenanceIntervalDays")) ? null : r.GetInt32(r.GetOrdinal("MaintenanceIntervalDays")),
            DepreciationYears = r.IsDBNull(r.GetOrdinal("DepreciationYears")) ? null : r.GetInt32(r.GetOrdinal("DepreciationYears")),
            Notes = r.IsDBNull(r.GetOrdinal("Notes")) ? "" : r.GetString(r.GetOrdinal("Notes")),
            CreatedAt = r.GetDateTime(r.GetOrdinal("CreatedDate")).ToString("o")
        };
    }

    private static AssetMaintenanceDto MapMaintenanceRow(SqlDataReader r) => new()
    {
        Id = r.GetInt32(r.GetOrdinal("MaintenanceID")).ToString(),
        AssetId = r.GetInt32(r.GetOrdinal("AssetID")).ToString(),
        AssetNumber = r.GetString(r.GetOrdinal("AssetNumber")),
        AssetName = r.GetString(r.GetOrdinal("AssetName")),
        MaintenanceType = r.GetString(r.GetOrdinal("MaintenanceType")),
        Status = r.GetString(r.GetOrdinal("Status")),
        ScheduledDate = ReadDate(r, "ScheduledDate"),
        CompletedDate = ReadDate(r, "CompletedDate"),
        PerformedBy = r.IsDBNull(r.GetOrdinal("PerformedBy")) ? "" : r.GetString(r.GetOrdinal("PerformedBy")),
        Vendor = r.IsDBNull(r.GetOrdinal("Vendor")) ? "" : r.GetString(r.GetOrdinal("Vendor")),
        Cost = r.IsDBNull(r.GetOrdinal("Cost")) ? null : r.GetDecimal(r.GetOrdinal("Cost")),
        Description = r.IsDBNull(r.GetOrdinal("Description")) ? "" : r.GetString(r.GetOrdinal("Description")),
        PartsUsed = r.IsDBNull(r.GetOrdinal("PartsUsed")) ? "" : r.GetString(r.GetOrdinal("PartsUsed")),
        NextDueDate = ReadDate(r, "NextDueDate"),
        Notes = r.IsDBNull(r.GetOrdinal("Notes")) ? "" : r.GetString(r.GetOrdinal("Notes")),
        CreatedAt = r.GetDateTime(r.GetOrdinal("CreatedDate")).ToString("o")
    };

    private static string? ReadDate(SqlDataReader r, string col)
    {
        var ord = r.GetOrdinal(col);
        return r.IsDBNull(ord) ? null : r.GetDateTime(ord).ToString("yyyy-MM-dd");
    }
}
