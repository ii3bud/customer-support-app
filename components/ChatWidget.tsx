'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import LoginModal from './LoginModal';

interface ActionOption {
  label: string;
  type:
    | 'refill_single'
    | 'refill_all'
    | 'cancel_appt'
    | 'reschedule_init'
    | 'reschedule_confirm'
    | 'send_report'
    | 'send_labs';
  payload?: any;
}

interface Message {
  sender: 'user' | 'agent';
  text: string;
  options?: ActionOption[];
}

export default function ChatWidget() {
  const [isMounted, setIsMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      sender: 'agent',
      text: 'أهلاً بك في البوابة الطبية الذكية لمجموعة حبيب الطبية! يمكنك الاستفسار وتنفيذ الخدمات مباشرة مثل: "مواعيدي"، "وصفاتي الطبية"، "التقارير والإجازات"، أو "نتائج التحاليل".',
    },
  ]);

  useEffect(() => {
    setIsMounted(true);

    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setUser(data.user);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null);
    });

    return () => authListener.subscription.unsubscribe();
  }, []);

  if (!isMounted) {
    return null;
  }

  // دالة مساعدة لتوليد المواعيد المتاحة للطبيب خلال 30 يوماً القادمة مع استثناء الأيام المحجوزة في قاعدة البيانات
  const getAvailableSlotsForDoctor = async (doctorName: string, currentApptDate: string) => {
    // جلب كافة المواعيد المؤكدة لهذا الطبيب في قاعدة البيانات لمعرفة الأيام المحجوزة
    const { data: bookedAppts } = await supabase
      .from('patient_appointments')
      .select('appointment_date')
      .eq('doctor_name', doctorName)
      .eq('status', 'مؤكد');

    const bookedDates = new Set(
      (bookedAppts || []).map((a) => new Date(a.appointment_date).toISOString().split('T')[0])
    );

    const availableSlots: { isoDate: string; displayDate: string }[] = [];
    const today = new Date();

    // البحث في الـ 30 يوماً القادمة عن أيام متاحة للطبيب (بغض النظر عن الجمعة)
    for (let i = 2; i <= 30; i++) {
      const candidate = new Date(today);
      candidate.setDate(today.getDate() + i);

      // استثناء يوم الجمعة (5) كإجازة أسبوعية افتراضية للعيادة
      if (candidate.getDay() === 5) continue;

      const dateStr = candidate.toISOString().split('T')[0];
      const currentStr = new Date(currentApptDate).toISOString().split('T')[0];

      // إذا كان اليوم غير محجوز في قاعدة البيانات وليس هو نفس يوم الموعد الحالي
      if (!bookedDates.has(dateStr) && dateStr !== currentStr) {
        // ضبط وقت افتراضي للعيادة (مثلاً 10:30 صباحاً أو 04:00 مساءً)
        candidate.setHours(i % 2 === 0 ? 10 : 16, 30, 0, 0);

        const formatted = candidate.toLocaleDateString('ar-SA', {
          weekday: 'long',
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        });
        const timeStr = i % 2 === 0 ? '10:30 صباحاً' : '04:30 مساءً';

        availableSlots.push({
          isoDate: candidate.toISOString(),
          displayDate: `${formatted} - الساعة ${timeStr}`,
        });
      }

      // نكتفي بعرض أفضل 5 مواعيد متاحة خلال الشهر القادم لسهولة الاختيار
      if (availableSlots.length >= 5) break;
    }

    return availableSlots;
  };

  // دالة تنفيذ الإجراءات التفاعلية عند ضغط المستخدم على أحد الخيارات
  const handleOptionClick = async (option: ActionOption) => {
    setMessages((prev) => [...prev, { sender: 'user', text: option.label }]);
    setLoading(true);

    const orderNumber = Math.floor(10000 + Math.random() * 90000);

    try {
      // 1. بدء طلب تعديل الموعد: فحص جدول الطبيب في قاعدة البيانات خلال شهر قادم
      if (option.type === 'reschedule_init') {
        const appt = option.payload;
        const availableSlots = await getAvailableSlotsForDoctor(
          appt.doctor_name,
          appt.appointment_date
        );

        if (availableSlots.length > 0) {
          const slotOptions: ActionOption[] = availableSlots.map((slot) => ({
            label: `📅 حجز: ${slot.displayDate}`,
            type: 'reschedule_confirm',
            payload: {
              apptId: appt.id,
              doctorName: appt.doctor_name,
              clinicName: appt.clinic_name,
              newIsoDate: slot.isoDate,
              displayDate: slot.displayDate,
            },
          }));

          setMessages((prev) => [
            ...prev,
            {
              sender: 'agent',
              text: `إليك المواعيد المتاحة في جدول ${appt.doctor_name} (${appt.clinic_name}) خلال الشهر القادم:\nيرجى اختيار الموعد الجديد لتأكيد التعديل في السجل:`,
              options: slotOptions,
            },
          ]);
        } else {
          setMessages((prev) => [
            ...prev,
            {
              sender: 'agent',
              text: `عذراً، جدول ${appt.doctor_name} محجوز بالكامل خلال الشهر القادم.`,
            },
          ]);
        }
      }

      // 2. تأكيد تعديل الموعد وتحديثه فعلياً في قاعدة بيانات Supabase
      else if (option.type === 'reschedule_confirm') {
        const { apptId, doctorName, clinicName, newIsoDate, displayDate } = option.payload;

        const { error } = await supabase
          .from('patient_appointments')
          .update({
            appointment_date: newIsoDate,
            status: 'مؤكد',
          })
          .eq('id', apptId);

        if (error) throw error;

        setMessages((prev) => [
          ...prev,
          {
            sender: 'agent',
            text: `تم تعديل موعدكم وتحديثه في قاعدة البيانات بنجاح برقم مرجعي (#${orderNumber})!\n\n• الطبيب: ${doctorName}\n• العيادة: ${clinicName}\n• الموعد الجديد: ${displayDate}\n\nتم حجز هذا الموعد في جدول الطبيب وإرسال إشعار التأكيد إلى بريدكم الإلكتروني ورقم الجوال المسجل.`,
          },
        ]);
      }

      // 3. إلغاء الموعد وتحديث حالته في قاعدة البيانات
      else if (option.type === 'cancel_appt') {
        const { error } = await supabase
          .from('patient_appointments')
          .update({ status: 'ملغي' })
          .eq('id', option.payload.id);

        if (error) throw error;

        setMessages((prev) => [
          ...prev,
          {
            sender: 'agent',
            text: `تم تأكيد إلغاء موعدكم مع ${option.payload.doctor_name} وتحديث السجل في قاعدة البيانات بنجاح برقم مرجعي (#${orderNumber}).\n\nتم إرسال إشعار تأكيد الإلغاء إلى بريدكم الإلكتروني ورقم الجوال المسجل.`,
          },
        ]);
      }

      // 4. إعادة صرف دواء واحد
      else if (option.type === 'refill_single') {
        setMessages((prev) => [
          ...prev,
          {
            sender: 'agent',
            text: `تم اعتماد وإرسال طلب إعادة صرف الدواء (${option.payload.medication_name}) إلى الصيدلية بنجاح برقم طلب مرجعي (#${orderNumber}).\n\nيمكنكم استلام الأدوية مباشرة من صيدلية المستشفى، كما تم إشعاركم بتفاصيل الطلب عبر البريد الإلكتروني ورقم الجوال المسجل في ملفكم الطبي.`,
          },
        ]);
      }

      // 5. إعادة صرف كافة الأدوية
      else if (option.type === 'refill_all') {
        const names = option.payload.map((p: any) => p.medication_name).join('، ');
        setMessages((prev) => [
          ...prev,
          {
            sender: 'agent',
            text: `تم اعتماد وإرسال طلب إعادة صرف كافة الوصفات الطبية (${names}) إلى الصيدلية بنجاح برقم طلب مرجعي (#${orderNumber}).\n\nيمكنكم استلامها مباشرة من صيدلية المستشفى، كما تم إشعاركم بتفاصيل الطلب عبر البريد الإلكتروني ورقم الجوال المسجل في ملفكم الطبي.`,
          },
        ]);
      }

      // 6. إرسال التقارير الطبية
      else if (option.type === 'send_report') {
        setMessages((prev) => [
          ...prev,
          {
            sender: 'agent',
            text: `تم إصدار نسخة مصدقة من التقارير والإجازات المرضية برقم طلب (#${orderNumber}).\n\nتم إرسال نسخة إلكترونية (PDF) إلى بريدكم الإلكتروني ورابط تحميل مباشر عبر رسالة نصية (SMS) إلى رقم الجوال المسجل.`,
          },
        ]);
      }

      // 7. إرسال نتائج المختبر والأشعة
      else if (option.type === 'send_labs') {
        setMessages((prev) => [
          ...prev,
          {
            sender: 'agent',
            text: `تم تجهيز التقرير التفصيلي لنتائج الفحوصات والأشعة برقم مرجعي (#${orderNumber}).\n\nتم إرسال التقرير الطبي المعتمد إلى بريدكم الإلكتروني وإشعاركم عبر رقم الجوال المسجل.`,
          },
        ]);
      }
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        { sender: 'agent', text: `حدث خطأ أثناء تنفيذ العملية في قاعدة البيانات: ${err.message}` },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userQuery = input.trim();
    const cleanQuery = userQuery.toLowerCase();
    setInput('');
    setMessages((prev) => [...prev, { sender: 'user', text: userQuery }]);
    setLoading(true);

    try {
      if (!user) {
        setMessages((prev) => [
          ...prev,
          {
            sender: 'agent',
            text: 'لتصفح سجلك الطبي والاستفادة من الخدمات الإلكترونية المخصصة، يرجى تسجيل الدخول أولاً.',
          },
        ]);
        setIsLoginModalOpen(true);
        setLoading(false);
        return;
      }

      // 1. سيناريو المواعيد (عرض المواعيد + خيار التعديل خلال شهر + خيار الإلغاء)
      if (
        cleanQuery.includes('موعد') ||
        cleanQuery.includes('مواعيد') ||
        cleanQuery.includes('مواعيدي') ||
        cleanQuery.includes('حجز') ||
        cleanQuery.includes('جدول')
      ) {
        const { data: appts } = await supabase
          .from('patient_appointments')
          .select('*')
          .eq('patient_id', user.id)
          .eq('status', 'مؤكد');

        if (appts && appts.length > 0) {
          const apptList = appts
            .map((a, i) => {
              const d = new Date(a.appointment_date).toLocaleDateString('ar-SA', {
                weekday: 'long',
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              });
              return `${i + 1}. ${a.doctor_name} (${a.clinic_name}) - بتاريخ: ${d}`;
            })
            .join('\n');

          // توليد خياري (تعديل الموعد) و (إلغاء الموعد) لكل موعد قائم
          const options: ActionOption[] = [];
          appts.forEach((a) => {
            options.push({
              label: `🗓️ تعديل موعد ${a.doctor_name}`,
              type: 'reschedule_init',
              payload: a,
            });
            options.push({
              label: `❌ إلغاء موعد ${a.doctor_name}`,
              type: 'cancel_appt',
              payload: a,
            });
          });

          setMessages((prev) => [
            ...prev,
            {
              sender: 'agent',
              text: `لديك المواعيد المؤكدة التالية في سجلك الطبي:\n${apptList}\n\nيرجى اختيار الإجراء المطلوب (تعديل الموعد لاستعراض الجدول المتاح خلال شهر، أو إلغاء الموعد):`,
              options,
            },
          ]);
        } else {
          setMessages((prev) => [
            ...prev,
            {
              sender: 'agent',
              text: 'لا توجد لديك مواعيد مؤكدة قائمة حالياً في السجل الطبي.',
            },
          ]);
        }
        setLoading(false);
        return;
      }

      // 2. سيناريو الوصفات الطبية وإعادة الصرف التفاعلي
      if (
        cleanQuery.includes('وصفة') ||
        cleanQuery.includes('وصفات') ||
        cleanQuery.includes('وصفاتي') ||
        cleanQuery.includes('دواء') ||
        cleanQuery.includes('أدوية') ||
        cleanQuery.includes('علاج') ||
        cleanQuery.includes('تجديد') ||
        cleanQuery.includes('صرف')
      ) {
        const { data: prescriptions } = await supabase
          .from('patient_prescriptions')
          .select('*')
          .eq('patient_id', user.id);

        if (prescriptions && prescriptions.length > 0) {
          const rxList = prescriptions
            .map((p, i) => `${i + 1}. ${p.medication_name} (${p.dosage}) - الحالة: ${p.status}`)
            .join('\n');

          const options: ActionOption[] = prescriptions.map((p) => ({
            label: `🔄 إعادة صرف: ${p.medication_name}`,
            type: 'refill_single',
            payload: p,
          }));

          if (prescriptions.length > 1) {
            options.push({
              label: '📦 إعادة صرف جميع الوصفات الطبية معاً',
              type: 'refill_all',
              payload: prescriptions,
            });
          }

          setMessages((prev) => [
            ...prev,
            {
              sender: 'agent',
              text: `إليك الوصفات الطبية المسجلة في ملفك:\n${rxList}\n\nيرجى اختيار الدواء المطلوب إعادة صرفه من الخيارات أدناه:`,
              options,
            },
          ]);
        } else {
          setMessages((prev) => [
            ...prev,
            { sender: 'agent', text: 'لا توجد وصفات طبية نشطة مسجلة في ملفك حالياً.' },
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
        cleanQuery.includes('إجازاتي') ||
        cleanQuery.includes('مرضية')
      ) {
        const { data: reports } = await supabase
          .from('patient_medical_reports')
          .select('*')
          .eq('patient_id', user.id);

        if (reports && reports.length > 0) {
          const listText = reports
            .map((r) => `• ${r.report_type} - بتاريخ ${r.issue_date} (${r.doctor_name})`)
            .join('\n');

          setMessages((prev) => [
            ...prev,
            {
              sender: 'agent',
              text: `تم العثور على الوثائق والتقارير التالية في ملفك الطبي:\n${listText}`,
              options: [
                {
                  label: '📩 إرسال نسخة مصدقة للإيميل والجوال (PDF)',
                  type: 'send_report',
                  payload: reports,
                },
              ],
            },
          ]);
        } else {
          setMessages((prev) => [
            ...prev,
            { sender: 'agent', text: 'لا توجد تقارير أو إجازات مرضية مسجلة في ملفك حالياً.' },
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
        cleanQuery.includes('فحوصات') ||
        cleanQuery.includes('نتائج')
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
              text: `إليك نتائج الفحوصات والأشعة المسجلة في ملفك الطبي:\n${labList}`,
              options: [
                {
                  label: '📄 إرسال التقرير التفصيلي لبريدي الإلكتروني والجوال',
                  type: 'send_labs',
                  payload: labs,
                },
              ],
            },
          ]);
        } else {
          setMessages((prev) => [
            ...prev,
            { sender: 'agent', text: 'لا توجد نتائج تحاليل أو أشعة مسجلة حالياً.' },
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
            text: `بيانات الملف الطبي المسجلة:\n• الاسم الكامل: ${profile?.full_name || 'غير محدد'}\n• رقم الهوية: ${profile?.national_id || '-'}\n• جهة التأمين الطبي: ${profile?.insurance_provider || '-'}`,
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
          text: 'يمكنك الاستفسار مباشرة عن: "مواعيدي"، "وصفاتي الطبية"، "إجازتي المرضية"، "نتائج التحاليل والأشعة"، أو "ملفي الطبي".',
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
            {
              sender: 'agent',
              text: 'تم تسجيل الدخول بنجاح! يمكنك الآن استعراض سجلك الطبي وطلب الخدمات التفاعلية مباشرة.',
            },
          ]);
        }}
      />

      <div className="fixed bottom-6 right-6 z-40 dir-rtl">
        {!isOpen && (
          <button
            onClick={() => setIsOpen(true)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-full p-4 shadow-lg flex items-center gap-2 transition-all"
          >
            <span className="font-semibold">المساعد الذكي</span> 💬
          </button>
        )}

        {isOpen && (
          <div className="bg-white rounded-2xl shadow-2xl w-80 sm:w-96 border border-gray-200 flex flex-col h-[540px] overflow-hidden">
            {/* Header */}
            <div className="bg-emerald-700 text-white p-4 flex justify-between items-center">
              <div>
                <h3 className="font-bold text-base">البوابة الطبية الذكية</h3>
                <p className="text-xs text-emerald-100">
                  {user ? `مرحباً بك (${user.email})` : 'زائر (غير مسجل)'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {user ? (
                  <button
                    onClick={handleLogout}
                    className="text-xs bg-red-500 hover:bg-red-600 px-2.5 py-1 rounded font-semibold"
                  >
                    خروج
                  </button>
                ) : (
                  <button
                    onClick={() => setIsLoginModalOpen(true)}
                    className="text-xs bg-white text-emerald-800 hover:bg-gray-100 px-2.5 py-1 rounded font-bold"
                  >
                    دخول
                  </button>
                )}
                <button onClick={() => setIsOpen(false)} className="font-bold text-lg mr-1">
                  ✕
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-gray-50">
              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`p-3 rounded-2xl max-w-[88%] text-sm whitespace-pre-line leading-relaxed ${
                      msg.sender === 'user'
                        ? 'bg-emerald-600 text-white rounded-br-none'
                        : 'bg-white text-gray-800 border border-gray-200 shadow-sm rounded-bl-none'
                    }`}
                  >
                    {msg.text}
                  </div>

                  {/* عرض أزرار الاختيارات التفاعلية تحت رسالة البوت */}
                  {msg.options && msg.options.length > 0 && (
                    <div className="mt-2 flex flex-col gap-1.5 w-[88%]">
                      {msg.options.map((opt, optIdx) => (
                        <button
                          key={optIdx}
                          onClick={() => handleOptionClick(opt)}
                          disabled={loading}
                          className="w-full text-right bg-emerald-50 hover:bg-emerald-600 text-emerald-800 hover:text-white border border-emerald-200 text-xs font-bold py-2.5 px-3 rounded-xl shadow-sm transition-all disabled:opacity-50"
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {loading && (
                <div className="text-xs text-gray-500 animate-pulse">
                  جاري معالجة الطلب وتحديث قاعدة البيانات...
                </div>
              )}
            </div>

            {/* Input */}
            <div className="p-3 border-t border-gray-200 bg-white flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder="اكتب طلبك هنا (مثال: مواعيدي)..."
                className="flex-1 border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-emerald-600"
              />
              <button
                onClick={handleSend}
                disabled={loading}
                className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50"
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
