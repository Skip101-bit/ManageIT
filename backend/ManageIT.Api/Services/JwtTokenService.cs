using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using ManageIT.Api.Models;
using Microsoft.IdentityModel.Tokens;

namespace ManageIT.Api.Services;

public sealed class JwtTokenService
{
    private readonly string _secret;
    private readonly string _issuer;
    private readonly string _audience;
    private readonly int _expiresHours;

    public JwtTokenService(IConfiguration config)
    {
        _secret = config["Jwt:Secret"]
            ?? throw new InvalidOperationException("Jwt:Secret is not configured.");
        _issuer = config["Jwt:Issuer"] ?? "ManageIT";
        _audience = config["Jwt:Audience"] ?? "ManageIT";
        _expiresHours = int.TryParse(config["Jwt:ExpiresHours"], out var h) ? h : 12;
    }

    public string CreateToken(UserDto user)
    {
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_secret));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
        var claims = new[]
        {
            new Claim(ClaimTypes.NameIdentifier, user.Id),
            new Claim("sal", user.SalNumber),
            new Claim(ClaimTypes.Role, user.Role),
            new Claim(ClaimTypes.Name, $"{user.FirstName} {user.LastName}".Trim())
        };

        var token = new JwtSecurityToken(
            issuer: _issuer,
            audience: _audience,
            claims: claims,
            expires: DateTime.UtcNow.AddHours(_expiresHours),
            signingCredentials: creds);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}
