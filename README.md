# מסיבת פרידה — איילת · תזכורת ואישור הגעה

אתר תזכורת בעברית (RTL) עם קישור אישי סודי לכל מוזמן, ושליחת WhatsApp דרך **Green API**.

## זרימה

1. ייבוא מוזמנים מהאקסל → לכל אחד נוצר `invite_token`.
2. מהאדמין שולחים תזכורת ב־WhatsApp (אחד־אחד או לכולם שטרם קיבלו).
3. ההודעה כוללת פרטי אירוע + קישור אישי `/i/TOKEN`.
4. האורח מאשר הגעה / אי־הגעה / לא בטוח — בלי חיפוש ובלי חשיפת אחרים.

## הגדרת Green API

ב־[console.green-api.com](https://console.green-api.com) קחו `idInstance` ו־`apiTokenInstance`, והוסיפו ל־`.env.local`:

```env
GREEN_API_ID_INSTANCE=...
GREEN_API_TOKEN_INSTANCE=...
NEXT_PUBLIC_SITE_URL=https://your-domain.vercel.app
ADMIN_PASSWORD=...
```

חשוב: `NEXT_PUBLIC_SITE_URL` חייב להיות הכתובת הציבורית האמיתית — זה הקישור שנשלח ב־WhatsApp.

## הרצה

```bash
npm install
cp .env.example .env.local
npm run import:xlsx
npm run dev
```

- אתר: http://localhost:3000  
- ניהול: http://localhost:3000/admin  

בלי Supabase הנתונים נשמרים ב־`data/rsvps.json`.

## פריסה

חברו ל־Vercel, הגדירו את משתני הסביבה (כולל Green API), Deploy.
