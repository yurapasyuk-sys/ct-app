# ⚠️ CRITICAL: Vercel Environment Variables Setup

## 🔧 **Action Required**

You need to manually configure Upstash Redis credentials in Vercel dashboard.

---

## 📝 **Step-by-Step Instructions**

### **1. Go to Vercel Dashboard**
```
https://vercel.com/bxrkxss-projects/borkiss-site/settings/environment-variables
```

### **2. Add Environment Variables**

Click "Add New" and add these **TWO** variables:

#### **Variable 1:**
```
Name:  UPSTASH_REDIS_REST_URL
Value: https://fast-insect-31056.upstash.io
Environment: Production, Preview, Development
```

#### **Variable 2:**
```
Name:  UPSTASH_REDIS_REST_TOKEN  
Value: AXlQAAIncDIyN2MzZDQxOWViODc0MmFiOGVkMmVkOWY0MThkOGY0MnAyMzEwNTY
Environment: Production, Preview, Development
```

### **3. Redeploy**

After adding variables, trigger a new deployment:

```bash
vercel --prod
```

Or push a new commit to trigger automatic deployment.

---

## ✅ **Verification**

After deployment, test the API:

```bash
curl https://borkiss.site/api/vpin?symbol=BTCUSDT&tf=m5&hours=24
```

Should return JSON with VPIN data.

---

## 🚨 **If VPIN Panel Shows Error**

1. Check Vercel deployment logs
2. Verify environment variables are set
3. Check Upstash Redis dashboard for connection issues
4. Test API endpoint directly

---

## 📊 **Expected Behavior**

- **First request**: ~10-15s (fetching & calculating)
- **Subsequent requests**: <50ms (cached)
- **Cache expiry**: 1 hour
- **Auto-refresh**: Every 60 seconds

---

**Note:** `.env.local` is for local development only. Production uses Vercel environment variables.

## 🔐 **Supabase Authentication Setup**

To enable Google Login, add these variables to Vercel:

#### **Variable 3:**
```
Name:  VITE_SUPABASE_URL
Value: https://ahydalhnwemdiesxsnpz.supabase.co
Environment: Production, Preview, Development
```

#### **Variable 4:**
```
Name:  VITE_SUPABASE_ANON_KEY
Value: [YOUR_SUPABASE_ANON_KEY]
Environment: Production, Preview, Development
```

> **Note:** Get the `VITE_SUPABASE_ANON_KEY` from your Supabase Project Settings > API.
