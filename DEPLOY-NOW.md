# 🚀 DEPLOY PE MOBILE - STEP BY STEP

## RAILWAY DEPLOYMENT (EASIEST METHOD)

### Step 1: Go to Railway
1. Open browser → https://railway.app
2. Click "Login" (top right)
3. Sign up with your email address (FREE account)

### Step 2: Create New Project
1. Click "New Project"
2. Select "Deploy from GitHub repo" OR "Empty Project"
3. If asked for source, choose "Upload Folder"

### Step 3: Upload Your App
1. Compress the folder: `simpro-mobile-replacement`
2. Upload the ZIP file
3. Railway will auto-detect it's a Node.js app

### Step 4: Environment Variables (CRITICAL!)
Set these in Railway dashboard under "Variables":
```
SIMPRO_API_KEY=f39cd3808a81d8c567250636b6c98f9d88f3928b
SIMPRO_BASE_URL=https://pe.simprocloud.com/api/v1.0/companies/30
SIMPRO_COMPANY_ID=30
JWT_SECRET=PE_Mobile_2026_Ultra_Secure_JWT_Secret_Key_For_Token_Authentication_System_64_Chars_Min
SESSION_SECRET=PE_Mobile_Session_Secret_2026_Strong_Random_Key_For_Session_Management_Security
NODE_ENV=production
PORT=8080
```

### Step 5: Deploy & Test
1. Railway automatically deploys
2. You get a URL like: https://pe-mobile-xyz123.railway.app
3. Test login with: ramsey / R@msey2026!PE

## YOUR LIVE APP URL
After deployment, share this with your team:
```
https://your-app.railway.app
```

Each team member logs in with their username/password:
- ramsey / R@msey2026!PE
- darius / D@rius2026!PE
- max / M@x2026!PE
- etc.

## COST: FREE
Railway gives you free hosting for your first project!