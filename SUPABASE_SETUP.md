# Supabase Authentication Setup

To enable Google Login for Centurion Pro, you need to configure your Supabase project and add the environment variables to your project.

## 1. Environment Variables

Create a `.env` file in the root of your project (if it doesn't exist) and add the following variables:

```env
VITE_SUPABASE_URL=https://ahydalhnwemdiesxsnpz.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

> **Note:** You can find your `VITE_SUPABASE_ANON_KEY` in your Supabase Project Settings > API.

## 2. Supabase Configuration

1.  Go to your [Supabase Dashboard](https://supabase.com/dashboard).
2.  Select your project.
3.  Go to **Authentication** > **Providers**.
4.  Enable **Google**.
5.  You will need to set up a Google Cloud Project and get the **Client ID** and **Client Secret**.
    *   Follow the [Supabase Google Login Guide](https://supabase.com/docs/guides/auth/social-login/auth-google) for detailed instructions.
6.  Add the **Authorized Redirect URI** in your Google Cloud Console:
    *   `https://ahydalhnwemdiesxsnpz.supabase.co/auth/v1/callback`

## 3. Usage

The application is now configured to use Supabase Authentication.
*   The `AuthProvider` wraps the application in `src/App.tsx`.
*   The `Sidebar` component (`src/components/Sidebar.tsx`) displays the Login/Logout buttons.
*   When a user logs in, they will be redirected to the dashboard.
