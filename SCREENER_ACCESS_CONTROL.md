# Screener Access Control Implementation

## Overview
Restricted access to the Screener page (`/dashboard/screener`) to authenticated users with **PRO** or **ULTRA** tier only. Unauthorized users will see a "Access Restricted" message with a login button.

## Changes

### 1. `src/pages/Screener.tsx`
*   Added `useAuth` hook integration.
*   Implemented `isAuthorized` logic checking for `user`, `profile`, and `tier`.
*   Added a "Access Restricted" UI state with a "Login with Google" button.
*   Passed `enabled: isAuthorized` to `useScreenerData` to prevent API calls for unauthorized users.

### 2. `src/hooks/useScreenerData.ts`
*   Added `enabled` option to the hook configuration.
*   Modified `useEffect` to skip WebSocket connection and data fetching if `enabled` is false.

## Verification
*   **Unauthenticated User**: Should see the "Access Restricted" screen with a login button. No network requests to screener API.
*   **Authenticated (No Tier/Free)**: Should see "Access Restricted" (assuming free tier exists or profile is missing).
*   **Authenticated (PRO/ULTRA)**: Should see the Screener dashboard and data should load.
