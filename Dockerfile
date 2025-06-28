# Use the official ASP.NET Core runtime as base image
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS base
WORKDIR /app
EXPOSE 80
EXPOSE 443

# Use the SDK image for building
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

# Copy the project file and restore dependencies
COPY ["ChatApp.csproj", "./"]
RUN dotnet restore "ChatApp.csproj"

# Copy the rest of the source code
COPY . .

# Build the application
RUN dotnet build "ChatApp.csproj" -c Release -o /app/build

# Publish the application
FROM build AS publish
RUN dotnet publish "ChatApp.csproj" -c Release -o /app/publish /p:UseAppHost=false

# Create the final runtime image
FROM base AS final
WORKDIR /app
COPY --from=publish /app/publish .

# Set environment variables - HTTP only for local hosting
ENV ASPNETCORE_URLS=http://+:80
ENV ASPNETCORE_ENVIRONMENT=Production

ENTRYPOINT ["dotnet", "ChatApp.dll"]