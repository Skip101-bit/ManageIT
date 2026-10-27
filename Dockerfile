FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY backend/ManageIT.Api/ManageIT.Api.csproj backend/ManageIT.Api/
RUN dotnet restore backend/ManageIT.Api/ManageIT.Api.csproj
COPY backend/ManageIT.Api/ backend/ManageIT.Api/
RUN dotnet publish backend/ManageIT.Api/ManageIT.Api.csproj -c Release -o /out --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0
# Program.cs resolves the UI at ../../frontend/public and ../../lms/renderer from the content root.
WORKDIR /app/backend/ManageIT.Api
COPY --from=build /out ./
COPY frontend/public /app/frontend/public
COPY lms/renderer /app/lms/renderer
ENV ASPNETCORE_ENVIRONMENT=Production
CMD ["sh", "-c", "ASPNETCORE_URLS=http://0.0.0.0:${PORT:-8080} exec dotnet ManageIT.Api.dll"]
