namespace ManageIT.Api.Services;

/// <summary>
/// Inventory transaction types (Receipt, Relocation, Transfer, etc.)
/// </summary>
public static class TransactionTypeHelper
{
    public const string Receipt = "Receipt";
    public const string BookInLegacy = "Book In";
    public const string BookOutLegacy = "Book Out";
    public const string Relocation = "Relocation";
    public const string TransferIn = "Transfer IN";
    public const string TransferOut = "Transfer OUT";
    public const string TransferReverse = "Transfer (Reverse)";
    public const string Adjustment = "Adjustment";

    public static string Normalize(string? type)
    {
        if (string.IsNullOrWhiteSpace(type)) return Receipt;
        return type.Trim() switch
        {
            "Book In" => Receipt,
            _ => type.Trim()
        };
    }

    public static bool IsOutbound(string? type)
    {
        var t = Normalize(type);
        return t is BookOutLegacy or TransferOut or TransferReverse;
    }

    public static bool IsNeutralQuantity(string? type)
    {
        return Normalize(type) == Relocation;
    }

    public static bool RequiresComment(string? type)
    {
        var t = Normalize(type);
        return t is TransferIn or TransferOut or TransferReverse;
    }

    public static int ComputeQuantityChange(string? type, int quantity, int? qtyBefore = null, int? qtyAfter = null)
    {
        var normalized = Normalize(type);
        if (normalized == Adjustment && qtyBefore.HasValue && qtyAfter.HasValue)
            return qtyAfter.Value - qtyBefore.Value;
        if (IsNeutralQuantity(type)) return 0;
        var abs = Math.Abs(quantity);
        return IsOutbound(type) ? -abs : abs;
    }

    public static string DisplayType(string? storedType)
    {
        return Normalize(storedType);
    }
}
