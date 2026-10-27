namespace ManageIT.Api.Models;

public sealed class AppStateDto
{
    public List<UserDto> Users { get; set; } = [];
    public List<JobDto> Jobs { get; set; } = [];
    public List<StockDto> Stock { get; set; } = [];
    public List<ActivityDto> Activity { get; set; } = [];
    public List<TransactionDto> Transactions { get; set; } = [];
    public List<StorageLocationDto> StorageLocations { get; set; } = [];
    public List<AuditDto> Audits { get; set; } = [];
    public List<ReconciliationDto> Reconciliations { get; set; } = [];
    public List<PendingApprovalDto> PendingApprovals { get; set; } = [];
    public List<AuditSessionDto> AuditSessions { get; set; } = [];
    public List<ReconReportDto> ReconHistory { get; set; } = [];
    public List<string> SerialNumbers { get; set; } = [];
    public List<AssetDto> Assets { get; set; } = [];
    public List<AssetMaintenanceDto> AssetMaintenance { get; set; } = [];
    public List<BomLineDto>? BomLines { get; set; }
    public List<PastelStepDto>? PastelTimeline { get; set; }
    public List<PastelCheckLineDto>? PastelChecks { get; set; }
    public List<PastelUpdateDto>? PastelUpdates { get; set; }
    public List<JobCardLineDto>? JobCardLines { get; set; }
    public List<StockCheckDto>? StockChecks { get; set; }
    public List<BomHistoryDto>? BomHistory { get; set; }
    public Dictionary<string, object?> Settings { get; set; } = new();
}

public sealed class UserDto
{
    public string Id { get; set; } = "";
    public string SalNumber { get; set; } = "";
    public string FirstName { get; set; } = "";
    public string LastName { get; set; } = "";
    public string Password { get; set; } = "";
    public string Role { get; set; } = "user";
    public string Status { get; set; } = "Active";
    /// <summary>When true, user may see the LMS tab and open Scope of Work after login.</summary>
    public bool CanAccessLms { get; set; }
    public string? CreatedAt { get; set; }
}

public sealed class LmsAccessResponse
{
    public bool CanAccessLms { get; set; }
}

public sealed class JobDto
{
    public string Id { get; set; } = "";
    public string JobNumber { get; set; } = "";
    public string JobDescription { get; set; } = "";
    public string JobType { get; set; } = "";
    public string OrderConfirmation { get; set; } = "";
    public string Category { get; set; } = "";
    public string Status { get; set; } = "Active";
    public string? CreatedAt { get; set; }
}

public sealed class StockDto
{
    public string Id { get; set; } = "";
    public string StockNumber { get; set; } = "";
    public string PartNumber { get; set; } = "";
    public string PartDescription { get; set; } = "";
    public string SerialNumber { get; set; } = "";
    public int Quantity { get; set; }
    public string StockCategory { get; set; } = "Production Inventory";
    public string StorageLocation { get; set; } = "";
    public string TrayBin { get; set; } = "";
    public string PoNumber { get; set; } = "";
    public string JobNumber { get; set; } = "";
    public string JobCategory { get; set; } = "";
    public string? CreatedAt { get; set; }
}

public sealed class ActivityDto
{
    public string Id { get; set; } = "";
    public string UserName { get; set; } = "";
    public string ActionPerformed { get; set; } = "";
    public string ScreenVisited { get; set; } = "";
    public string ActivityDescription { get; set; } = "";
    public string StockNumber { get; set; } = "";
    public string Quantity { get; set; } = "";
    public string Timestamp { get; set; } = "";
}

public sealed class TransactionDto
{
    public string Id { get; set; } = "";
    public string StockItemId { get; set; } = "";
    public string StockNumber { get; set; } = "";
    public string PartDescription { get; set; } = "";
    public string Type { get; set; } = "";
    public int Quantity { get; set; }
    public int? QtyBefore { get; set; }
    public int? QtyAfter { get; set; }
    public string StorageLocation { get; set; } = "";
    public string JobNumber { get; set; } = "";
    public string TransferTo { get; set; } = "";
    public string TransferFrom { get; set; } = "";
    public string PoNumber { get; set; } = "";
    public string Comment { get; set; } = "";
    public string UserName { get; set; } = "";
    public string Timestamp { get; set; } = "";
}

public sealed class StorageLocationDto
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string Description { get; set; } = "";
    public string Building { get; set; } = "";
    public string Type { get; set; } = "";
}

public sealed class AuditDto
{
    public string Id { get; set; } = "";
    public string AuditDate { get; set; } = "";
    public string StockNumber { get; set; } = "";
    public string PartDescription { get; set; } = "";
    public int SystemQty { get; set; }
    public int AuditedQty { get; set; }
    public string Result { get; set; } = "";
    public string AuditedBy { get; set; } = "";
}

public sealed class ReconciliationDto
{
    public string Id { get; set; } = "";
    public string StockNumber { get; set; } = "";
    public string PartDescription { get; set; } = "";
    public int SystemQty { get; set; }
    public int PhysicalQty { get; set; }
    public int Variance { get; set; }
    public string Status { get; set; } = "";
    public string? ReconciledAt { get; set; }
}

public sealed class LoginRequest
{
    public string SalNumber { get; set; } = "";
    public string Password { get; set; } = "";
    /// <summary>Optional: "sms" or "lms". When "lms", login fails if the user has no LMS access.</summary>
    public string? Brand { get; set; }
}

public sealed class LoginResponse
{
    public bool Success { get; set; }
    public string? Message { get; set; }
    public string? Token { get; set; }
    public UserDto? User { get; set; }
    public Dictionary<string, string>? Permissions { get; set; }
    public string? RoleDisplayName { get; set; }
}

public sealed class PendingApprovalDto
{
    public string Id { get; set; } = "";
    public string Type { get; set; } = "";
    public string Status { get; set; } = "Pending";
    public string StockNumber { get; set; } = "";
    public string Description { get; set; } = "";
    public int QuantityChange { get; set; }
    public string RequestedBy { get; set; } = "";
    public string RequestedAt { get; set; } = "";
    public string? PayloadJson { get; set; }
}

public sealed class HealthResponse
{
    public string Status { get; set; } = "";
    public bool DatabaseConnected { get; set; }
    public string? DatabaseError { get; set; }
}

/// <summary>Multi-count inventory audit session (Stock-IT portal).</summary>
public sealed class AuditSessionDto
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string? CreatedAt { get; set; }
    public string? CreatedBy { get; set; }
    public string Status { get; set; } = "";
    public Dictionary<string, int>? MasterSnapshot { get; set; }
    public Dictionary<string, AuditCountPhaseDto>? Counts { get; set; }
    public Dictionary<string, ReconReportDto>? ReconReports { get; set; }
}

public sealed class AuditCountPhaseDto
{
    public bool Submitted { get; set; }
    public string? SubmittedAt { get; set; }
    public List<AuditCountLineDto>? Lines { get; set; }
}

public sealed class AuditCountLineDto
{
    public string StockId { get; set; } = "";
    public string StockNumber { get; set; } = "";
    public string PartDescription { get; set; } = "";
    public string? StockCategory { get; set; }
    public string? SerialNumber { get; set; }
    public int? CountedQty { get; set; }
}

public sealed class ReconReportDto
{
    public string Id { get; set; } = "";
    public string SessionId { get; set; } = "";
    public int CountNumber { get; set; }
    public string RunAt { get; set; } = "";
    public string RunBy { get; set; } = "";
    public List<ReconLineDto>? Lines { get; set; }
    public List<string>? Transactions { get; set; }
    public string Status { get; set; } = "complete";
}

public sealed class ReconLineDto
{
    public string StockId { get; set; } = "";
    public string StockNumber { get; set; } = "";
    public string PartDescription { get; set; } = "";
    public int MasterQty { get; set; }
    public int? Count1 { get; set; }
    public int? Count2 { get; set; }
    public int? Count3 { get; set; }
    public int? VarianceMaster { get; set; }
    public int? VarianceC1C2 { get; set; }
    public int? VarianceC2C3 { get; set; }
    public bool Flagged { get; set; }
    public string? FlagReason { get; set; }
    public bool QualifiesNextCount { get; set; }
    public int? AdjustmentQty { get; set; }
    public bool? Approved { get; set; }
    public string? Approver { get; set; }
}

public sealed class SerialNumberRequest
{
    public string SerialNumber { get; set; } = "";
}

public sealed class AssetDto
{
    public string Id { get; set; } = "";
    public string AssetNumber { get; set; } = "";
    public string AssetName { get; set; } = "";
    public string Description { get; set; } = "";
    public string Category { get; set; } = "";
    public string SubCategory { get; set; } = "";
    public string Manufacturer { get; set; } = "";
    public string Model { get; set; } = "";
    public string SerialNumber { get; set; } = "";
    public string AssetTag { get; set; } = "";
    public string Status { get; set; } = "Active";
    public string Condition { get; set; } = "";
    public string StorageLocation { get; set; } = "";
    public string JobNumber { get; set; } = "";
    public string AssignedTo { get; set; } = "";
    public string Department { get; set; } = "";
    public string? PurchaseDate { get; set; }
    public decimal? PurchaseCost { get; set; }
    public decimal? CurrentValue { get; set; }
    public string? WarrantyExpiry { get; set; }
    public string? InsuranceExpiry { get; set; }
    public string? LastInspectionDate { get; set; }
    public string? NextInspectionDue { get; set; }
    public int? MaintenanceIntervalDays { get; set; }
    public int? DepreciationYears { get; set; }
    public string Notes { get; set; } = "";
    public string? CreatedAt { get; set; }
}

public sealed class BomLineDto
{
    public string Id { get; set; } = "";
    public string JobNumber { get; set; } = "";
    public string PartNumber { get; set; } = "";
    public string Description { get; set; } = "";
    public decimal Qty { get; set; }
    public string Discipline { get; set; } = "Other";
    public string Source { get; set; } = "";
    public string ExportedBy { get; set; } = "";
    public string PnUpdateLocation { get; set; } = "";
    public string PnUpdateReason { get; set; } = "";
}

public sealed class PastelStepDto
{
    public string Id { get; set; } = "";
    public int Order { get; set; }
    public string Title { get; set; } = "";
    public string Owner { get; set; } = "";
    public string Status { get; set; } = "Pending";
    public string DueDate { get; set; } = "";
    public string Notes { get; set; } = "";
}

public sealed class PastelCheckLineDto
{
    public string Id { get; set; } = "";
    public string PartNumber { get; set; } = "";
    public string Description { get; set; } = "";
    public decimal? PastelQty { get; set; }
    public decimal? LibraryQty { get; set; }
    public string Status { get; set; } = "";
}

public sealed class PastelUpdateDto
{
    public string Id { get; set; } = "";
    public string Owner { get; set; } = "Me";
    public string PartNumber { get; set; } = "";
    public string Description { get; set; } = "";
    public string Status { get; set; } = "Open";
    public string Notes { get; set; } = "";
}

public sealed class JobCardLineDto
{
    public string Id { get; set; } = "";
    public string JobNumber { get; set; } = "";
    public string PartNumber { get; set; } = "";
    public string Description { get; set; } = "";
    public decimal JobCardQty { get; set; }
    public decimal CostingQty { get; set; }
}

public sealed class StockCheckDto
{
    public string Id { get; set; } = "";
    public string JobNumber { get; set; } = "";
    public string RunAt { get; set; } = "";
    public string RunBy { get; set; } = "";
    public int ShortCount { get; set; }
    public int CoveredCount { get; set; }
    public int OverCount { get; set; }
    public int CostingDiffCount { get; set; }
    public List<StockCheckLineDto> Lines { get; set; } = [];
}

public sealed class BomHistoryDto
{
    public string Id { get; set; } = "";
    public string At { get; set; } = "";
    public string JobNumber { get; set; } = "";
    public string Type { get; set; } = "";
    public string Summary { get; set; } = "";
    public List<BomHistoryLineDto> Lines { get; set; } = [];
}

public sealed class BomHistoryLineDto
{
    public string PartNumber { get; set; } = "";
    public string Description { get; set; } = "";
    public decimal BomQty { get; set; }
    public decimal FreeQty { get; set; }
    public decimal ShortBy { get; set; }
    public string Status { get; set; } = "";
}

public sealed class StockCheckLineDto
{
    public string JobNumber { get; set; } = "";
    public string PartNumber { get; set; } = "";
    public string Description { get; set; } = "";
    public decimal JobCardQty { get; set; }
    public decimal CostingQty { get; set; }
    public decimal OnHand { get; set; }
    public decimal OnJob { get; set; }
    public decimal ShortBy { get; set; }
    public string StockStatus { get; set; } = "";
    public string CostingStatus { get; set; } = "";
}

public sealed class AssetMaintenanceDto
{
    public string Id { get; set; } = "";
    public string AssetId { get; set; } = "";
    public string AssetNumber { get; set; } = "";
    public string AssetName { get; set; } = "";
    public string MaintenanceType { get; set; } = "Preventive";
    public string Status { get; set; } = "Scheduled";
    public string? ScheduledDate { get; set; }
    public string? CompletedDate { get; set; }
    public string PerformedBy { get; set; } = "";
    public string Vendor { get; set; } = "";
    public decimal? Cost { get; set; }
    public string Description { get; set; } = "";
    public string PartsUsed { get; set; } = "";
    public string? NextDueDate { get; set; }
    public string Notes { get; set; } = "";
    public string? CreatedAt { get; set; }
}
