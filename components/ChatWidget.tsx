'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import LoginModal from './LoginModal';

interface Message {
  sender: 'user' | 'agent';
  text: string;
  actionUrl?: string;
  actionText?: string;
}

export default function ChatWidget() {
  // 1. حارس التحقق لمنع مشكلة Hydration Error بين السيرفر والمتصفح
  const [isMounted, setIsMounted] = useState(false);

  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      sender: 'agent',
      text: 'أهلاً بك في البوابة الطبية الذكية! يمكنك الاستفسار عن المواعيد، الوصفات، التقارير الطبية، أو نتائج التحاليل والأشعة.',
    },
  ]);

  useEffect(() => {
    setIsMounted(true); // تفعيل الجاهزية بعد رندر المتصفح الأول

    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setUser(data.user);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null);
    });

    return () => authListener.subscription.unsubscribe();
  }, []);

  // عدم رندر أي مكونات حية حتى يكتمل تحميل المتصفح تفادياً لخطأ Hydration
  if (!isMounted) {
    return null;
  }

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userQuery = input.trim();
    const cleanQuery = userQuery.toLowerCase(); // تنظيف النص للمطابقة
    setInput('');
    setMessages((prev) => [...prev, { sender: 'user', text: userQuery }]);
    setLoading(true);

    try {
      if (!user) {
        setMessages((prev) => [
          ...prev,
          {
            sender: 'agent',
            text: 'لتصفح سجلك الطبي والاستفادة من الخدمات المخصصة، يرجى تسجيل الدخول أولاً.',
          },
        ]);
        setIsLoginModalOpen(true);
        setLoading(false);
        return;
      }

      // 1. سيناريو المواعيد (استعلام / تعديل / إلغاء / مواعيدي)
      if (
        cleanQuery.includes('موعد') ||
        cleanQuery.includes('مواعيد') ||
        cleanQuery.includes('مواعيدي') ||
        cleanQuery.includes('حجز')
      ) {
        const { data: appts } = await supabase
          .from('patient_appointments')
          .select('*')
          .eq('patient_id', user.id)
          .eq('status', 'مؤكد');

        if (appts && appts.length > 0) {
          const appt = appts[0];
          const dateFormatted = new Date(appt.appointment_date).toLocaleDateString('ar-SA');
          setMessages((prev) => [
            ...prev,
            {
              sender: 'agent',
              text: `لديك موعد قادم مع ${appt.doctor_name} في [${appt.clinic_name}] بتاريخ ${dateFormatted}.`,
              actionUrl: `/appointments/manage?id=${appt.id}`,
              actionText: 'إلغاء أو تعديل الموعد',
            },
          ]);
        } else {
          setMessages((prev) => [
            ...prev,
            {
              sender: 'agent',
              text: 'لا توجد لديك مواعيد قائمة حالياً. هل ترغب في حجز موعد جديد؟',
              actionUrl: '/appointments/book',
              actionText: 'حجز موعد جديد',
            },
          ]);
        }
        setLoading(false);
        return;
      }

      // 2. سيناريو الوصفات الطبية وتجديدها
      if (
        cleanQuery.includes('وصفة') ||
        cleanQuery.includes('وصفات') ||
        cleanQuery.includes('وصفاتي') ||
        cleanQuery.includes('دواء') ||
        cleanQuery.includes('علاج') ||
        cleanQuery.includes('تجديد')
      ) {
        const { data: prescriptions } = await supabase
          .from('patient_prescriptions')
          .select('*')
          .eq('patient_id', user.id);

        if (prescriptions && prescriptions.length > 0) {
          const rxList = prescriptions
            .map((p) => `• ${p.medication_name} (${p.dosage}) - الحالة: ${p.status}`)
            .join('\n');
          setMessages((prev) => [
            ...prev,
            {
              sender: 'agent',
              text: `إليك الوصفات المسجلة في ملفك:\n${rxList}`,
              actionUrl: `/prescriptions/renew?id=${prescriptions[0].id}`,
              actionText: `تأكيد طلب إعادة صرف (${prescriptions[0].medication_name})`,
            },
          ]);
        } else {
          setMessages((prev) => [
            ...prev,
            { sender: 'agent', text: 'لا توجد وصفات مسجلة في سجلك حالياً.' },
          ]);
        }
        setLoading(false);
        return;
      }

      // 3. سيناريو التقارير والإجازات المرضية
      if (
        cleanQuery.includes('تقرير') ||
        cleanQuery.includes('تقارير') ||
        cleanQuery.includes('إجازة') ||
        cleanQuery.includes('اجازة') ||
        cleanQuery.includes('إجازاتي')
      ) {
        const { data: reports } = await supabase
          .from('patient_medical_reports')
          .select('*')
          .eq('patient_id', user.id);

        if (reports && reports.length > 0) {
          const listText = reports
            .map((r) => `• ${r.report_type} بتاريخ ${r.issue_date} (${r.doctor_name})`)
            .join('\n');
          setMessages((prev) => [
            ...prev,
            {
              sender: 'agent',
              text: `تم العثور على الوثائق التالية في ملفك الطبي:\n${listText}`,
              actionUrl: '/reports/download',
              actionText: 'تحميل التقارير والإجازات (PDF)',
            },
          ]);
        } else {
          setMessages((prev) => [
            ...prev,
            { sender: 'agent', text: 'لا توجد تقارير أو إجازات مرضية مسجلة في ملفك.' },
          ]);
        }
        setLoading(false);
        return;
      }

      // 4. سيناريو التحاليل والأشعة
      if (
        cleanQuery.includes('تحليل') ||
        cleanQuery.includes('تحاليل') ||
        cleanQuery.includes('أشعة') ||
        cleanQuery.includes('اشعة') ||
        cleanQuery.includes('فحص') ||
        cleanQuery.includes('فحوصات')
      ) {
        const { data: labs } = await supabase
          .from('patient_lab_results')
          .select('*')
          .eq('patient_id', user.id);

        if (labs && labs.length > 0) {
          const labList = labs
            .map((l) => `• [${l.test_type}] ${l.test_name} (${l.result_date}): ${l.summary}`)
            .join('\n');
          setMessages((prev) => [
            ...prev,
            {
              sender: 'agent',
              text: `إليك نتائج الفحوصات والأشعة من ملفك الطبي:\n${labList}`,
              actionUrl: '/lab-results/view',
              actionText: 'عرض التقارير الطبية التفصيلية',
            },
          ]);
        } else {
          setMessages((prev) => [
            ...prev,
            { sender: 'agent', text: 'لا توجد نتائج تحاليل أو أشعة جديدة مسجلة.' },
          ]);
        }
        setLoading(false);
        return;
      }

      // 5. استعراض الملف الطبي الشامل
      if (
        cleanQuery.includes('ملفي') ||
        cleanQuery.includes('سجلي') ||
        cleanQuery.includes('تأمين') ||
        cleanQuery.includes('تأميني')
      ) {
        const { data: profile } = await supabase
          .from('patient_profiles')
          .select('*')
          .eq('id', user.id)
          .single();

        setMessages((prev) => [
          ...prev,
          {
            sender: 'agent',
            text: `معلومات الملف الطبي:\nالاسم: ${profile?.full_name || 'غير محدد'}\nرقم الهوية: ${profile?.national_id || '-'}\nشركة التأمين: ${profile?.insurance_provider || '-'}`,
            actionUrl: '/profile',
            actionText: 'استعراض السجل الطبي الكامل',
          },
        ]);
        setLoading(false);
        return;
      }

      // رد افتراضي للخدمات العامة
      setMessages((prev) => [
        ...prev,
        {
          sender: 'agent',
          text: 'يمكنك الاستفسار عن: "مواعيدي"، "وصفاتي الطبية"، "إجازتي المرضية"، "نتائج التحاليل والأشعة"، أو "ملفي الطبي".',
        },
      ]);
    } catch (err: any) {
      console.error(err);
      setMessages((prev) => [
        ...prev,
        { sender: 'agent', text: `حدث خطأ أثناء معالجة الطلب: ${err.message}` },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  return (
    <>
      <LoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
        onSuccess={(loggedUser) => {
          setUser(loggedUser);
          setMessages((prev) => [
            ...prev,
            { sender: 'agent', text: 'تم تسجيل الدخول بنجاح! يمكنك الآن استعراض سجلك الطبي وطلب الخدمات المخصصة.' },
          ]);
        }}
      />

      <div className="fixed bottom-6 right-6 z-40 dir-rtl">
        {!isOpen && (
          <button
            onClick={() => setIsOpen(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white rounded-full p-4 shadow-lg flex items-center gap-2 transition-all"
          >
            <span className="font-semibold">المساعد الذكي</span> 💬
          </button>
        )}

        {isOpen && (
          <div className="bg-white rounded-2xl shadow-2xl w-80 sm:w-96 border border-gray-200 flex flex-col h-[520px] overflow-hidden">
            {/* Header */}
            <div className="bg-blue-600 text-white p-4 flex justify-between items-center">
              <div>
                <h3 className="font-bold text-base">البوابة الطبية الذكية</h3>
                <p className="text-xs text-blue-100">
                  {user ? `مرحباً بك (${user.email})` : 'زائر (غير مسجل)'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {user ? (
                  <button onClick={handleLogout} className="text-xs bg-red-500 hover:bg-red-600 px-2 py-1 rounded">
                    خروج
                  </button>
                ) : (
                  <button
                    onClick={() => setIsLoginModalOpen(true)}
                    className="text-xs bg-emerald-500 hover:bg-emerald-600 px-2.5 py-1 rounded font-bold"
                  >
                    دخول
                  </button>
                )}
                <button onClick={() => setIsOpen(false)} className="font-bold text-lg">✕</button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-gray-50">
              {messages.map((msg, idx) => (
                <div key={idx} className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}>
                  <div
                    className={`p-3 rounded-2xl max-w-[85%] text-sm whitespace-pre-line ${
                      msg.sender === 'user'
                        ? 'bg-blue-600 text-white rounded-br-none'
                        : 'bg-white text-gray-800 border border-gray-200 shadow-sm rounded-bl-none'
                    }`}
                  >
                    {msg.text}
                  </div>
                  {msg.actionUrl && (
                    <a
                      href={msg.actionUrl}
                      className="mt-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-2 px-4 rounded-xl shadow transition-all"
                    >
                      🔗 {msg.actionText}
                    </a>
                  )}
                </div>
              ))}
              {loading && <div className="text-xs text-gray-500 animate-pulse">جاري الاستعلام من قاعدة البيانات...</div>}
            </div>

            {/* Input */}
            <div className="p-3 border-t border-gray-200 bg-white flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder="اكتب طلبك..."
                className="flex-1 border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-600"
              />
              <button
                onClick={handleSend}
                disabled={loading}
                className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
              >
                إرسال
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
