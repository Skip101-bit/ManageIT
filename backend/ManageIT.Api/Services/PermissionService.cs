namespace ManageIT.Api.Services;

public static class PermissionCodes
{
    public const string UserManagement = "UserManagement";
    public const string SystemSettings = "SystemSettings";
    public const string StockNumber = "StockNumber";
    public const string StockDescription = "StockDescription";
    public const string StockCategory = "StockCategory";
    public const string UnitOfMeasure = "UnitOfMeasure";
    public const string StockLocation = "StockLocation";
    public const string CurrentQuantity = "CurrentQuantity";
    public const string MinimumStockLevel = "MinimumStockLevel";
    public const string StockReceiving = "StockReceiving";
    public const string StockIssuing = "StockIssuing";
    public const string StockTransfer = "StockTransfer";
    public const string StockReturns = "StockReturns";
    public const string StockAdjustments = "StockAdjustments";
    public const string StockTake = "StockTake";
    public const string AuditAdjustments = "AuditAdjustments";
    public const string ViewReports = "ViewReports";
    public const string TransactionHistory = "TransactionHistory";
    public const string ExportReports = "ExportReports";
    public const string DeleteTransactions = "DeleteTransactions";
    public const string AssetManagement = "AssetManagement";
}

public static class PermissionLevels
{
    public const string None = "None";
    public const string View = "View";
    public const string CreateEdit = "CreateEdit";
    public const string Approve = "Approve";
    public const string Full = "Full";
    public const string Request = "Request";
}

public sealed class PermissionService
{
    private static readonly Dictionary<string, Dictionary<string, string>> Matrix = BuildMatrix();

    public IReadOnlyDictionary<string, string> GetPermissionsForRole(string roleCode)
    {
        var key = NormalizeRole(roleCode);
        return Matrix.TryGetValue(key, out var perms)
            ? perms
            : Matrix["viewer"];
    }

    public string GetRoleDisplayName(string roleCode) => NormalizeRole(roleCode) switch
    {
        "admin" => "Admin",
        "stockCapturer" => "Stock Capturer",
        "approver" => "Approver",
        "storeManager" => "Store Manager",
        "auditor" => "Auditor",
        "viewer" => "Viewer",
        _ => roleCode
    };

    public static string NormalizeRole(string role) => role switch
    {
        "Admin" or "admin" => "admin",
        "StockCapturer" or "stockCapturer" or "Stock Capturer" => "stockCapturer",
        "Approver" or "approver" => "approver",
        "StoreManager" or "storeManager" or "Store Manager" => "storeManager",
        "Auditor" or "auditor" => "auditor",
        "Viewer" or "viewer" or "User" or "user" => "viewer",
        _ => role.ToLowerInvariant()
    };

    public static string MapRoleFromDb(string role) => NormalizeRole(role);

    public static string MapRoleToDb(string role) => NormalizeRole(role) switch
    {
        "admin" => "Admin",
        "stockCapturer" => "StockCapturer",
        "approver" => "Approver",
        "storeManager" => "StoreManager",
        "auditor" => "Auditor",
        "viewer" => "Viewer",
        _ => "Viewer"
    };

    public bool CanView(string role, string function) =>
        LevelRank(GetLevel(role, function)) >= LevelRank(PermissionLevels.View);

    public bool CanEdit(string role, string function)
    {
        var level = GetLevel(role, function);
        return level is PermissionLevels.CreateEdit or PermissionLevels.Full;
    }

    public bool CanApprove(string role, string function)
    {
        var level = GetLevel(role, function);
        return level is PermissionLevels.Approve or PermissionLevels.Full;
    }

    public bool CanFull(string role, string function) =>
        GetLevel(role, function) == PermissionLevels.Full;

    public bool IsRequestOnly(string role, string function) =>
        GetLevel(role, function) == PermissionLevels.Request;

    public bool Satisfies(string role, string function, string requiredLevel)
    {
        var actual = GetLevel(role, function);
        if (requiredLevel == PermissionLevels.None)
            return actual == PermissionLevels.None;
        return LevelRank(actual) >= LevelRank(requiredLevel);
    }

    private static string GetLevel(string role, string function)
    {
        var key = NormalizeRole(role);
        if (!Matrix.TryGetValue(key, out var perms))
            return PermissionLevels.None;
        return perms.TryGetValue(function, out var level) ? level : PermissionLevels.None;
    }

    private static int LevelRank(string level) => level switch
    {
        PermissionLevels.Full => 5,
        PermissionLevels.Approve => 4,
        PermissionLevels.CreateEdit => 3,
        PermissionLevels.Request => 2,
        PermissionLevels.View => 1,
        _ => 0
    };

    private static Dictionary<string, Dictionary<string, string>> BuildMatrix()
    {
        var admin = FullRow(
            userMgmt: PermissionLevels.Full, settings: PermissionLevels.Full,
            stockMaster: PermissionLevels.Full, stockLocQty: PermissionLevels.Full,
            tx: PermissionLevels.Full, adjustments: PermissionLevels.Full,
            stockTake: PermissionLevels.Full, auditAdj: PermissionLevels.Full,
            reports: PermissionLevels.Full, exports: PermissionLevels.Full,
            deleteTx: PermissionLevels.Full, assetMgmt: PermissionLevels.Full);

        var capturer = FullRow(
            userMgmt: PermissionLevels.None, settings: PermissionLevels.None,
            stockMaster: PermissionLevels.CreateEdit, stockLocQty: PermissionLevels.CreateEdit,
            tx: PermissionLevels.CreateEdit, adjustments: PermissionLevels.Request,
            stockTake: PermissionLevels.CreateEdit, auditAdj: PermissionLevels.None,
            reports: PermissionLevels.View, exports: PermissionLevels.View,
            deleteTx: PermissionLevels.None, assetMgmt: PermissionLevels.View);

        var approver = FullRow(
            userMgmt: PermissionLevels.None, settings: PermissionLevels.None,
            stockMaster: PermissionLevels.View, stockLocQty: PermissionLevels.View,
            tx: PermissionLevels.Approve, adjustments: PermissionLevels.Approve,
            stockTake: PermissionLevels.Approve, auditAdj: PermissionLevels.Approve,
            reports: PermissionLevels.View, exports: PermissionLevels.View,
            deleteTx: PermissionLevels.None, assetMgmt: PermissionLevels.View);

        var manager = FullRow(
            userMgmt: PermissionLevels.None, settings: PermissionLevels.None,
            stockMaster: PermissionLevels.View, stockLocQty: PermissionLevels.CreateEdit,
            tx: PermissionLevels.CreateEdit, adjustments: PermissionLevels.Request,
            stockTake: PermissionLevels.CreateEdit, auditAdj: PermissionLevels.None,
            reports: PermissionLevels.View, exports: PermissionLevels.View,
            deleteTx: PermissionLevels.None, assetMgmt: PermissionLevels.CreateEdit);

        var auditor = FullRow(
            userMgmt: PermissionLevels.View, settings: PermissionLevels.None,
            stockMaster: PermissionLevels.View, stockLocQty: PermissionLevels.View,
            tx: PermissionLevels.View, adjustments: PermissionLevels.View,
            stockTake: PermissionLevels.Full, auditAdj: PermissionLevels.CreateEdit,
            reports: PermissionLevels.Full, exports: PermissionLevels.Full,
            deleteTx: PermissionLevels.None, assetMgmt: PermissionLevels.View);

        var viewer = FullRow(
            userMgmt: PermissionLevels.None, settings: PermissionLevels.None,
            stockMaster: PermissionLevels.View, stockLocQty: PermissionLevels.View,
            tx: PermissionLevels.View, adjustments: PermissionLevels.None,
            stockTake: PermissionLevels.View, auditAdj: PermissionLevels.None,
            reports: PermissionLevels.View, exports: PermissionLevels.None,
            deleteTx: PermissionLevels.None, assetMgmt: PermissionLevels.View);

        return new Dictionary<string, Dictionary<string, string>>
        {
            ["admin"] = admin,
            ["stockCapturer"] = capturer,
            ["approver"] = approver,
            ["storeManager"] = manager,
            ["auditor"] = auditor,
            ["viewer"] = viewer
        };
    }

    private static Dictionary<string, string> FullRow(
        string userMgmt, string settings,
        string stockMaster, string stockLocQty,
        string tx, string adjustments,
        string stockTake, string auditAdj,
        string reports, string exports, string deleteTx, string assetMgmt) => new()
    {
        [PermissionCodes.UserManagement] = userMgmt,
        [PermissionCodes.SystemSettings] = settings,
        [PermissionCodes.StockNumber] = stockMaster,
        [PermissionCodes.StockDescription] = stockMaster,
        [PermissionCodes.StockCategory] = stockMaster,
        [PermissionCodes.UnitOfMeasure] = stockMaster,
        [PermissionCodes.StockLocation] = stockLocQty,
        [PermissionCodes.CurrentQuantity] = stockLocQty,
        [PermissionCodes.MinimumStockLevel] = stockLocQty,
        [PermissionCodes.StockReceiving] = tx,
        [PermissionCodes.StockIssuing] = tx,
        [PermissionCodes.StockTransfer] = tx,
        [PermissionCodes.StockReturns] = tx,
        [PermissionCodes.StockAdjustments] = adjustments,
        [PermissionCodes.StockTake] = stockTake,
        [PermissionCodes.AuditAdjustments] = auditAdj,
        [PermissionCodes.ViewReports] = reports,
        [PermissionCodes.TransactionHistory] = reports,
        [PermissionCodes.ExportReports] = exports,
        [PermissionCodes.DeleteTransactions] = deleteTx,
        [PermissionCodes.AssetManagement] = assetMgmt
    };
}
