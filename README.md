# מסיבת פרידה — איילת · תזכורת ואישור הגעה

אתר תזכורת בעברית (RTL) עם קישור אישי סודי לכל מוזמן, ושליחת WhatsApp דרך **Green API**.  
בפרודקשן (Vercel) הנתונים נשמרים ב־**Supabase**.

## זרימה

1. ייבוא מוזמנים מהאקסל → לכל אחד נוצר `invite_token`.
2. מהאדמין שולחים תזכורת ב־WhatsApp.
3. האורח נכנס לקישור האישי ומאשר הגעה.

## הרצה מקומית

```bash
npm install
cp .env.example .env.local
# מלאו SUPABASE_* + GREEN_API_* + ADMIN_PASSWORD
npm run import:xlsx
npm run dev
```

- אתר: http://localhost:3000  
- ניהול: http://localhost:3000/admin  

## Vercel

1. Import מ־GitHub.
2. Environment Variables:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `ADMIN_PASSWORD`
   - `GREEN_API_ID_INSTANCE`
   - `GREEN_API_TOKEN_INSTANCE`
   - `NEXT_PUBLIC_SITE_URL` = כתובת האתר ב־Vercel
3. Deploy.

Dashboard: https://supabase.com/dashboard/project/szjmhlsbqwjietwieder
