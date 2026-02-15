# Tenant Location & Profile Feature

## Overview

This feature allows Tenants (businesses) to configure their profile and location details, which are then displayed to clients during the booking process and in appointment reminders.

## Key Components

### 1. Tenant Profile & Location

- **Database**: `Tenant` entity now includes `profile` (phone, booking settings) and `location` (address, coordinates, maps URL).
- **Management**:
  - Admin Dashboard -> Settings -> "Mi Negocio" and "Ubicación".
  - Endpoints: `GET /tenants/me` and `PATCH /tenants/me` (Protected for Tenant Admin).

### 2. Public Access

- **Endpoint**: `GET /tenants/slug/:slug` (Public).
- **Usage**: The Booking Portal fetches tenant details using the tenant's slug to display the business name, description, and location.

### 3. Client Experience

- **Booking Portal**: Displays the business title, description, and address. Includes a "Cómo llegar" button if a Google Maps URL is provided.
- **My Appointments**: Shows the address of the service location for each appointment.
- **Reminders**: WhatsApp and Email reminders now include the address in the message text.

## Configuration

To configure these details:

1. Log in to the Admin Dashboard.
2. Navigate to **Configuración** (Settings).
3. Fill in the **Perfil del Negocio** and **Ubicación** forms.
4. Save changes.

## Development Notes

- **Frontend Service**: `TenantsService` (`src/app/dashboard/services/tenants.service.ts`) handles both protected (profile management) and public (booking info) data fetching.
- **Backend Controller**: `TenantsController` includes a public endpoint for fetching by slug and protected endpoints for profile management.
- **Permissions**: Profile updates are restricted to the Tenant Admin (`ADMIN` role) for their own tenant.
