using System.Text.Json;
using ManageIT.Api.Models;
using Microsoft.Data.SqlClient;

namespace ManageIT.Api.Services;

public sealed partial class ManageItDataService
{
    private const string EngineeringDocKey = "state";

    private sealed class EngineeringDoc
    {
        public List<BomLineDto> BomLines { get; set; } = [];
        public List<PastelStepDto> PastelTimeline { get; set; } = [];
        public List<PastelCheckLineDto> PastelChecks { get; set; } = [];
        public List<PastelUpdateDto> PastelUpdates { get; set; } = [];
        public List<JobCardLineDto> JobCardLines { get; set; } = [];
        public List<StockCheckDto> StockChecks { get; set; } = [];
        public List<BomHistoryDto> BomHistory { get; set; } = [];
    }

    private async Task TryEnsureEngineeringTableAsync(CancellationToken ct)
    {
        try
        {
            await using var conn = new SqlConnection(_connectionString);
            await conn.OpenAsync(ct);
            await using var cmd = new SqlCommand("""
                IF OBJECT_ID('dbo.EngineeringDocs', 'U') IS NULL
                CREATE TABLE dbo.EngineeringDocs (
                    DocKey      VARCHAR(40)   NOT NULL PRIMARY KEY,
                    PayloadJson NVARCHAR(MAX) NOT NULL,
                    UpdatedAt   DATETIME      NOT NULL DEFAULT GETDATE()
                )
                """, conn);
            await cmd.ExecuteNonQueryAsync(ct);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Engineering tables are not available yet.");
        }
    }

    private async Task<EngineeringDoc?> LoadEngineeringAsync(SqlConnection conn, CancellationToken ct)
    {
        if (!await TableExistsAsync(conn, "EngineeringDocs", ct))
            return null;

        await using var cmd = new SqlCommand(
            "SELECT PayloadJson FROM dbo.EngineeringDocs WHERE DocKey = @key", conn);
        cmd.Parameters.AddWithValue("@key", EngineeringDocKey);
        var json = await cmd.ExecuteScalarAsync(ct) as string;
        if (string.IsNullOrWhiteSpace(json))
            return new EngineeringDoc();

        return JsonSerializer.Deserialize<EngineeringDoc>(json, JsonOpts) ?? new EngineeringDoc();
    }

    private async Task SyncEngineeringAsync(
        SqlConnection conn, SqlTransaction tx, AppStateDto state, CancellationToken ct)
    {
        if (state.BomLines == null && state.PastelTimeline == null && state.PastelChecks == null
            && state.PastelUpdates == null && state.JobCardLines == null && state.StockChecks == null
            && state.BomHistory == null)
            return;

        if (!await TableExistsAsync(conn, "EngineeringDocs", ct, tx))
            return;

        EngineeringDoc existing = new();
        await using (var read = new SqlCommand(
            "SELECT PayloadJson FROM dbo.EngineeringDocs WHERE DocKey = @key", conn, tx))
        {
            read.Parameters.AddWithValue("@key", EngineeringDocKey);
            var json = await read.ExecuteScalarAsync(ct) as string;
            if (!string.IsNullOrWhiteSpace(json))
                existing = JsonSerializer.Deserialize<EngineeringDoc>(json, JsonOpts) ?? new EngineeringDoc();
        }

        var doc = new EngineeringDoc
        {
            BomLines = state.BomLines ?? existing.BomLines,
            PastelTimeline = state.PastelTimeline ?? existing.PastelTimeline,
            PastelChecks = state.PastelChecks ?? existing.PastelChecks,
            PastelUpdates = state.PastelUpdates ?? existing.PastelUpdates,
            JobCardLines = state.JobCardLines ?? existing.JobCardLines,
            StockChecks = state.StockChecks ?? existing.StockChecks,
            BomHistory = state.BomHistory ?? existing.BomHistory
        };

        var payload = JsonSerializer.Serialize(doc, JsonOpts);
        await using var cmd = new SqlCommand("""
            IF EXISTS (SELECT 1 FROM dbo.EngineeringDocs WHERE DocKey = @key)
                UPDATE dbo.EngineeringDocs SET PayloadJson = @json, UpdatedAt = GETDATE() WHERE DocKey = @key
            ELSE
                INSERT INTO dbo.EngineeringDocs (DocKey, PayloadJson) VALUES (@key, @json)
            """, conn, tx);
        cmd.Parameters.AddWithValue("@key", EngineeringDocKey);
        cmd.Parameters.AddWithValue("@json", payload);
        await cmd.ExecuteNonQueryAsync(ct);
    }
}
