using System.Security.Claims;
using ManageIT.Api.Services;

namespace ManageIT.Api;

internal static class PermissionAuthorization
{
    public static string GetRole(ClaimsPrincipal user) =>
        user.FindFirstValue(ClaimTypes.Role) ?? "viewer";

    public static bool IsDenied(
        PermissionService perms,
        ClaimsPrincipal user,
        string function,
        string minLevel,
        out IResult result)
    {
        var role = GetRole(user);
        if (!perms.Satisfies(role, function, minLevel))
        {
            result = Results.Json(
                new { error = "You do not have permission for this action." },
                statusCode: 403);
            return true;
        }

        result = Results.Ok();
        return false;
    }
}
