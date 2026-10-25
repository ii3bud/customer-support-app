'use client';

import ChatWidget from '@/components/ChatWidget';

export default function Home() {
  return (
    <div className="min-h-screen bg-white text-gray-800 font-sans antialiased selection:bg-emerald-100 selection:text-emerald-900" dir="rtl">
      
      {/* 1. الهيدر العلوي (مع إزالة أيقونة البحث وقائمة الثلاث شرطات) */}
      <header className="w-full border-b border-gray-100 bg-white/95 backdrop-blur-sm sticky top-0 z-30 transition-all">
        <div className="max-w-7xl mx-auto px-6 sm:px-10 h-20 flex items-center justify-between">
          
          {/* الشعار واسم المجموعة */}
          <div className="flex items-center gap-3">
            <div className="flex flex-col text-right">
              <span className="font-extrabold text-base sm:text-lg text-emerald-800 tracking-tight leading-snug">
                مجموعة حبيب الطبية
              </span>
              <span className="text-[10px] sm:text-xs font-semibold text-emerald-600 tracking-wider">
                HABIB MEDICAL GROUP
              </span>
              <span className="text-[9px] text-gray-400">
                المجموعة الطبية medical group
              </span>
            </div>
            
            {/* أيقونة الشعار الهندسية الخضراء */}
            <div className="w-10 h-10 sm:w-11 sm:h-11 bg-emerald-600 rounded-xl flex items-center justify-center text-white shadow-md shadow-emerald-600/20">
              <span className="font-black text-2xl tracking-tighter">H</span>
            </div>
          </div>

          {/* مساحة فارغة في الطرف الآخر بعد إزالة البحث والمنيو */}
          <div></div>
        </div>
      </header>

      {/* 2. قسم البانر الترحيبي (Hero Section) */}
      <main className="max-w-7xl mx-auto px-6 sm:px-10 pt-10 pb-16">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
          
          {/* الجانب الأيمن: النصوص والأزرار */}
          <div className="lg:col-span-7 flex flex-col items-start space-y-6 text-right">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-gray-900 leading-[1.25] tracking-tight">
              رواد الرعاية <br />
              <span className="text-gray-900">الصحية المتميزة</span>
            </h1>

            <p className="text-gray-500 text-base sm:text-lg max-w-xl leading-relaxed">
              نضع صحتك وصحة عائلتك في صميم اهتمامنا، مع تقديم أحدث التقنيات الطبية ونخبة من الاستشاريين المتخصصين على مدار الساعة.
            </p>

            <button className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-base px-8 py-3.5 rounded-xl shadow-lg shadow-emerald-600/25 transition-all transform hover:-translate-y-0.5 active:translate-y-0">
              تعرف على خدماتنا
            </button>
          </div>

          {/* الجانب الأيسر: بطاقة الصورة والإحصائيات العائمة */}
          <div className="lg:col-span-5 relative flex justify-center items-center">
            
            {/* البطاقة المركزية للأطباء */}
            <div className="w-[300px] sm:w-[340px] h-[360px] sm:h-[400px] bg-gradient-to-tr from-emerald-50 via-teal-50/40 to-white rounded-3xl border border-emerald-100/60 p-4 relative overflow-hidden shadow-2xl shadow-emerald-900/5 flex flex-col justify-end items-center">
              
              {/* صورة الأطباء الرمزية المفرغة */}
              <div className="absolute inset-0 flex items-center justify-center pt-8">
                <img 
                  src="https://images.unsplash.com/photo-1622253692010-333f2da6031d?q=80&w=800&auto=format&fit=crop" 
                  alt="فريق طبي متكامل" 
                  className="w-full h-full object-cover object-top opacity-90 rounded-2xl filter saturate-[1.1]"
                />
              </div>

              {/* بطاقة عائمة 1: عدد المنشآت الطبية (أعلى اليسار) */}
              <div className="absolute top-4 left-4 bg-white/95 backdrop-blur-sm border border-gray-100 shadow-lg rounded-2xl p-2.5 px-4 flex items-center gap-3">
                <div className="text-right">
                  <span className="block font-black text-gray-900 text-lg leading-none">27</span>
                  <span className="text-[11px] text-gray-500 font-medium">منشأة طبية</span>
                </div>
                <div className="w-8 h-8 rounded-xl bg-gray-900 text-white flex items-center justify-center font-bold text-xs">
                  H
                </div>
              </div>

              {/* بطاقة عائمة 2: عدد الصيدليات (أسفل الوسط) */}
              <div className="absolute bottom-4 right-4 bg-white/95 backdrop-blur-sm border border-gray-100 shadow-lg rounded-2xl p-2.5 px-4 flex items-center gap-3 z-10">
                <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold text-xs">
                  ✚
                </div>
                <div className="text-right">
                  <span className="block font-black text-gray-900 text-lg leading-none">33</span>
                  <span className="text-[11px] text-gray-500 font-medium">صيدلية</span>
                </div>
              </div>

              {/* بطاقة عائمة 3: عدد الأطباء (أسفل اليمين) */}
              <div className="absolute bottom-4 left-4 bg-white/95 backdrop-blur-sm border border-gray-100 shadow-lg rounded-2xl p-2.5 px-4 flex items-center gap-3 z-10">
                <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center text-xs">
                  👨‍⚕️
                </div>
                <div className="text-right">
                  <span className="block font-black text-gray-900 text-lg leading-none">+4500</span>
                  <span className="text-[11px] text-gray-500 font-medium">طبيب</span>
                </div>
              </div>

            </div>

          </div>

        </div>

        {/* 3. قسم "خدماتنا وفقاً لاحتياجاتك" */}
        <section className="mt-24 text-center">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
            خدماتنا وفقاً لاحتياجاتك
          </h2>
          <p className="mt-3 text-sm sm:text-base text-gray-500 max-w-2xl mx-auto leading-relaxed">
            نقدم العديد من الخدمات التي تلبي احتياجات المرضى المختلفة، والمصممة خصيصاً لتقديم تجربة مميزة لهم.
          </p>

          <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            
            {/* بطاقة الخدمة 1 */}
            <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all text-right group">
              <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center text-xl mb-4 group-hover:bg-emerald-600 group-hover:text-white transition-all">
                📅
              </div>
              <h3 className="font-bold text-lg text-gray-900 mb-2">حجز المواعيد الفورية</h3>
              <p className="text-sm text-gray-500 leading-relaxed">
                تصفح جدول مواعيد أفضل الاستشاريين واحجز موعدك الحضوري أو الافتراضي بكل سهولة.
              </p>
            </div>

            {/* بطاقة الخدمة 2 */}
            <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all text-right group">
              <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center text-xl mb-4 group-hover:bg-blue-600 group-hover:text-white transition-all">
                🧪
              </div>
              <h3 className="font-bold text-lg text-gray-900 mb-2">نتائج المختبر والأشعة</h3>
              <p className="text-sm text-gray-500 leading-relaxed">
                استعرض تقارير فحوصاتك المخبرية وصور الأشعة التشخيصية فور اعتمادها من الطبيب.
              </p>
            </div>

            {/* بطاقة الخدمة 3 */}
            <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all text-right group">
              <div className="w-12 h-12 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center text-xl mb-4 group-hover:bg-purple-600 group-hover:text-white transition-all">
                💊
              </div>
              <h3 className="font-bold text-lg text-gray-900 mb-2">خدمة وصفتي وإعادة الصرف</h3>
              <p className="text-sm text-gray-500 leading-relaxed">
                متابعة الوصفات الدوائية المعتمدة وطلب إعادة الصرف مع إمكانية التوصيل المنزلي.
              </p>
            </div>

          </div>
        </section>
      </main>

      {/* 4. إدراج المساعد الذكي (ChatWidget) في الصفحة */}
      <ChatWidget />

    </div>
  );
}
