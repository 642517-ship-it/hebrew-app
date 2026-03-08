# 🇮🇱 عبري بسهولة — دليل النشر

## خطوات نشر التطبيق على الإنترنت (مجاناً)

---

### المتطلبات
- حساب GitHub: https://github.com
- حساب Vercel: https://vercel.com (سجّل بحساب GitHub)
- Node.js مثبّت على جهازك: https://nodejs.org

---

## الخطوة ١ — تثبيت المشروع محلياً

افتح Terminal أو Command Prompt في مجلد المشروع ثم:

```bash
npm install
npm run dev
```

افتح المتصفح على: http://localhost:5173

---

## الخطوة ٢ — رفع المشروع على GitHub

1. افتح https://github.com/new
2. اسم المستودع: `hebrew-vocab-app`
3. اضغط **Create repository**
4. في Terminal:

```bash
git init
git add .
git commit -m "first commit"
git branch -M main
git remote add origin https://github.com/اسمك/hebrew-vocab-app.git
git push -u origin main
```

---

## الخطوة ٣ — النشر على Vercel

1. افتح https://vercel.com
2. اضغط **Add New Project**
3. اختر المستودع `hebrew-vocab-app`
4. اضغط **Deploy** — انتظر دقيقة واحدة ✅

ستحصل على رابط مثل:
```
https://hebrew-vocab-app.vercel.app
```

---

## الخطوة ٤ — مشاركة الطلاب

شارك الرابط مع الطلاب. على كل جهاز:

### 📱 iPhone / iPad:
1. افتح الرابط في **Safari** (ليس Chrome)
2. اضغط زر المشاركة 📤
3. اضغط **"إضافة إلى الشاشة الرئيسية"**
4. يظهر التطبيق مثل أي تطبيق عادي ✅

### 🤖 Android:
1. افتح الرابط في **Chrome**
2. يظهر بنر "تثبيت التطبيق" تلقائياً
3. أو: القائمة ← "إضافة إلى الشاشة الرئيسية" ✅

### 💻 كمبيوتر:
- يعمل مباشرة في المتصفح

---

## ملاحظات مهمة

- ✅ التطبيق يعمل **بدون إنترنت** بعد أول تحميل (PWA)
- ✅ بيانات كل طالب محفوظة على جهازه الشخصي
- ✅ التحديثات تصل تلقائياً لجميع الطلاب عند تعديل الكود
- ⚠️ ميزة "تلقائي" (التشكيل والترجمة) تحتاج إنترنت

---

## تحديث التطبيق لاحقاً

أي تعديل في الكود ثم:
```bash
git add .
git commit -m "update"
git push
```
Vercel ينشر التحديث تلقائياً خلال دقيقة.
