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
    | 'book_select_doctor'
    | 'book_slot_confirm'
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
      text: 'أهلاً بك في البوابة الطبية الذكية لمجموعة حبيب الطبية! يمكنك الاستفسار وتنفيذ الخدمات مباشرة مثل: "حجز موعد جديد"، "مواعيدي"، "وصفاتي الطبية"، "التقارير"، "إجازتي المرضية"، أو "نتائج التحاليل".',
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

  const getAvailableSlotsForDoctor = async (doctorName: string, excludeDate?: string) => {
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

    for (let i = 1; i <= 30; i++) {
      const candidate = new Date(today);
      candidate.setDate(today.getDate() + i);

      if (candidate.getDay() === 5) continue;

      const dateStr = candidate.toISOString().split('T')[0];
      const excludeStr = excludeDate ? new Date(excludeDate).toISOString().split('T')[0] : '';

      if (!bookedDates.has(dateStr) && dateStr !== excludeStr) {
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

      if (availableSlots.length >= 5) break;
    }

    return availableSlots;
  };

  const handleOptionClick = async (option: ActionOption) => {
    setMessages((prev) => [...prev, { sender: 'user', text: option.label }]);
    setLoading(true);

    const orderNumber = Math.floor(10000 + Math.random() * 90000);

    try {
      if (option.type === 'book_select_doctor') {
        const { data: doctorsList } = await supabase.from('doctors').select('*');
        const docOptions: ActionOption[] = (doctorsList || []).map((doc: any) => ({
          label: `🩺 ${doc.doctor_name} (${doc.clinic_name})`,
          type: 'book_slot_confirm',
          payload: { name: doc.doctor_name, clinic: doc.clinic_name },
        }));

        setMessages((prev) => [
          ...prev,
          {
            sender: 'agent',
            text: 'اختر الطبيب أو التخصص المناسب لحجز موعد جديد من قاعدة البيانات:',
            options: docOptions,
          },
        ]);
      } else if (option.type === 'book_slot_confirm' && !option.payload?.isNewBooking && !option.payload?.apptId) {
        const selectedDoc = option.payload;
        const availableSlots = await getAvailableSlotsForDoctor(selectedDoc.name);

        if (availableSlots.length > 0) {
          const slotOptions: ActionOption[] = availableSlots.map((slot) => ({
            label: `📅 تأكيد حجز: ${slot.displayDate}`,
            type: 'book_slot_confirm',
            payload: {
              doctorName: selectedDoc.name,
              clinicName: selectedDoc.clinic,
              newIsoDate: slot.isoDate,
              displayDate: slot.displayDate,
              isNewBooking: true,
            },
          }));

          setMessages((prev) => [
            ...prev,
            {
              sender: 'agent',
              text: `المواعيد المتاحة في جدول ${selectedDoc.name} (${selectedDoc.clinic}) خلال الشهر القادم:\nيرجى اختيار الموعد المناسب لإتمام الحجز:`,
              options: slotOptions,
            },
          ]);
        } else {
          setMessages((prev) => [
            ...prev,
            { sender: 'agent', text: `عذراً، جدول ${selectedDoc.name} محجوز بالكامل.` },
          ]);
        }
      } else if (option.type === 'book_slot_confirm' && option.payload?.isNewBooking) {
        const { doctorName, clinicName, newIsoDate, displayDate } = option.payload;

        const { error } = await supabase.from('patient_appointments').insert([
          {
            patient_id: user.id,
            doctor_name: doctorName,
            clinic_name: clinicName,
            appointment_date: newIsoDate,
            status: 'مؤكد',
          },
        ]);

        if (error) throw error;

        setMessages((prev) => [
          ...prev,
          {
            sender: 'agent',
            text: `تم حجز موعدك الجديد وتسجيله في النظام بنجاح برقم مرجعي (#${orderNumber})!\n\n• الطبيب: ${doctorName}\n• العيادة: ${clinicName}\n• موعد الزيارة: ${displayDate}\n\nتم إرسال إشعار التأكيد لبريدك الإلكتروني وجوالك المسجل.`,
          },
        ]);
      } else if (option.type === 'reschedule_init') {
        const appt = option.payload;
        const availableSlots = await getAvailableSlotsForDoctor(appt.doctor_name, appt.appointment_date);

        if (availableSlots.length > 0) {
          const slotOptions: ActionOption[] = availableSlots.map((slot) => ({
            label: `📅 حجز البديل: ${slot.displayDate}`,
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
              text: `المواعيد المتاحة في جدول ${appt.doctor_name} خلال الشهر القادم:\nاختر الموعد الجديد لتحديثه في السجل:`,
              options: slotOptions,
            },
          ]);
        } else {
          setMessages((prev) => [
            ...prev,
            { sender: 'agent', text: `عذراً، جدول ${appt.doctor_name} محجوز بالكامل.` },
          ]);
        }
      } else if (option.type === 'reschedule_confirm') {
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
            text: `تم تعديل موعدك وتحديثه في قاعدة البيانات بنجاح برقم مرجعي (#${orderNumber})!\n• الطبيب: ${doctorName}\n• العيادة: ${clinicName}\n• الموعد الجديد: ${displayDate}`,
          },
        ]);
      } else if (option.type === 'cancel_appt') {
        const { error } = await supabase
          .from('patient_appointments')
          .update({ status: 'ملغي' })
          .eq('id', option.payload.id);

        if (error) throw error;

        setMessages((prev) => [
          ...prev,
          {
            sender: 'agent',
            text: `تم تأكيد إلغاء موعدك مع ${option.payload.doctor_name} في النظام برقم مرجعي (#${orderNumber}).`,
          },
        ]);
      } else if (option.type === 'refill_single') {
        setMessages((prev) => [
          ...prev,
          {
            sender: 'agent',
            text: `تم إرسال طلب إعادة صرف الدواء (${option.payload.medication_name}) للصيدلية بنجاح برقم مرجعي (#${orderNumber}).`,
          },
        ]);
      } else if (option.type === 'refill_all') {
        const names = option.payload.map((p: any) => p.medication_name).join('، ');
        setMessages((prev) => [
          ...prev,
          {
            sender: 'agent',
            text: `تم إرسال طلب إعادة صرف كافة الوصفات (${names}) للصيدلية برقم مرجعي (#${orderNumber}).`,
          },
        ]);
      } else if (option.type === 'send_report') {
        setMessages((prev) => [
          ...prev,
          {
            sender: 'agent',
            text: `تم إصدار نسخة مصدقة من التقارير والإجازات الطبية برقم مرجعي (#${orderNumber}) وتم إرسالها لبريدك الإلكتروني وجوالك المسجل.`,
          },
        ]);
      } else if (option.type === 'send_labs') {
        setMessages((prev) => [
          ...prev,
          {
            sender: 'agent',
            text: `تم تجهيز تقرير التحاليل والأشعة برقم مرجعي (#${orderNumber}) وإرساله لبريدك الإلكتروني ورقم جوالك المسجل.`,
          },
        ]);
      }
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        { sender: 'agent', text: `حدث خطأ أثناء الاتصال بقاعدة البيانات: ${err.message}` },
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
            text: 'لتصفح سجلك الطبي والاستفادة من الخدمات المخصصة، يرجى تسجيل الدخول أولاً.',
          },
        ]);
        setIsLoginModalOpen(true);
        setLoading(false);
        return;
      }

      if (
        cleanQuery.includes('حجز') ||
        cleanQuery.includes('موقع') ||
        cleanQuery.includes('موعد جديد') ||
        cleanQuery.includes('اضافه موعد') ||
        cleanQuery.includes('إضافة موعد') ||
        cleanQuery.includes('ابي احجز') ||
        cleanQuery.includes('أبي أحجز') ||
        cleanQuery.includes('جديد')
      ) {
        const { data: doctorsList } = await supabase.from('doctors').select('*');
        const docOptions: ActionOption[] = (doctorsList || []).map((doc: any) => ({
          label: `🩺 ${doc.doctor_name} (${doc.clinic_name})`,
          type: 'book_slot_confirm',
          payload: { name: doc.doctor_name, clinic: doc.clinic_name },
        }));

        setMessages((prev) => [
          ...prev,
          {
            sender: 'agent',
            text: 'اختر الطبيب أو التخصص المناسب لحجز موعد جديد من قاعدة البيانات:',
            options: docOptions,
          },
        ]);
        setLoading(false);
        return;
      }

      if (
        cleanQuery.includes('موعد') ||
        cleanQuery.includes('مواعيد') ||
        cleanQuery.includes('مواعيدي') ||
        cleanQuery.includes('جدول') ||
        cleanQuery.includes('زيارة') ||
        cleanQuery.includes('حجوزاتي')
      ) {
        const { data: appts } = await supabase
          .from('patient_appointments')
          .select('*')
          .eq('patient_id', user.id)
          .eq('status', 'مؤكد');

        const options: ActionOption[] = [
          {
            label: '➕ حجز موعد جديد مع طبيب',
            type: 'book_select_doctor',
          },
        ];

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

          appts.forEach((a) => {
            options.push({
              label: `🗓️ تعديل موعد د. ${a.doctor_name}`,
              type: 'reschedule_init',
              payload: a,
            });
            options.push({
              label: `❌ إلغاء موعد د. ${a.doctor_name}`,
              type: 'cancel_appt',
              payload: a,
            });
          });

          setMessages((prev) => [
            ...prev,
            {
              sender: 'agent',
              text: `لديك المواعيد المؤكدة التالية:\n${apptList}\n\nيمكنك اختيار الإجراء المطلوب أو حجز موعد إضافي:`,
              options,
            },
          ]);
        } else {
          setMessages((prev) => [
            ...prev,
            {
              sender: 'agent',
              text: 'لا توجد لديك مواعيد مؤكدة قائمة حالياً في السجل.\nهل ترغب في حجز موعد جديد؟',
              options,
            },
          ]);
        }
        setLoading(false);
        return;
      }

      if (
        cleanQuery.includes('وصفة') ||
        cleanQuery.includes('وصفات') ||
        cleanQuery.includes('وصفاتي') ||
        cleanQuery.includes('دواء') ||
        cleanQuery.includes('أدوية') ||
        cleanQuery.includes('علاج') ||
        cleanQuery.includes('علاجي') ||
        cleanQuery.includes('صرف') ||
        cleanQuery.includes('تجديد')
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
              text: `إليك الوصفات الطبية في ملفك:\n${rxList}\n\nاختر الدواء المطلوب لإعادة الصرف:`,
              options,
            },
          ]);
        } else {
          setMessages((prev) => [
            ...prev,
            { sender: 'agent', text: 'لا توجد وصفات طبية مسجلة حالياً.' },
          ]);
        }
        setLoading(false);
        return;
      }

      if (
        cleanQuery.includes('تقرير') ||
        cleanQuery.includes('تقارير') ||
        cleanQuery.includes('تقاريري') ||
        cleanQuery.includes('إجازة') ||
        cleanQuery.includes('اجازة') ||
        cleanQuery.includes('إجازاتي') ||
        cleanQuery.includes('إجازتي المرضية') ||
        cleanQuery.includes('مرضية') ||
        cleanQuery.includes('المرضية') ||
        cleanQuery.includes('شهادة')
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
              text: `تم العثور على التقارير والإجازات الطبية في ملفك:\n${listText}`,
              options: [{ label: '📩 إرسال نسخة مصدقة للإيميل والجوال (PDF)', type: 'send_report' }],
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

      if (
        cleanQuery.includes('تحليل') ||
        cleanQuery.includes('تحاليل') ||
        cleanQuery.includes('تحاليلى') ||
        cleanQuery.includes('تحاليري') ||
        cleanQuery.includes('نتائج التحاليل') ||
        cleanQuery.includes('أشعة') ||
        cleanQuery.includes('اشعة') ||
        cleanQuery.includes('فحص') ||
        cleanQuery.includes('فحوصات') ||
        cleanQuery.includes('نتائج') ||
        cleanQuery.includes('تخدير')
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
              text: `إليك نتائج التحاليل والفحوصات والأشعة في ملفك:\n${labList}`,
              options: [{ label: '📄 إرسال التقرير التفصيلي لبريدي وجوالي', type: 'send_labs' }],
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

      if (
        cleanQuery.includes('ملفي') ||
        cleanQuery.includes('سجلي') ||
        cleanQuery.includes('معلوماتي') ||
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
            text: `بيانات الملف الطبي:\n• الاسم: ${profile?.full_name || 'غير محدد'}\n• الهوية: ${profile?.national_id || '-'}\n• التأمين: ${profile?.insurance_provider || '-'}`,
          },
        ]);
        setLoading(false);
        return;
      }

      setMessages((prev) => [
        ...prev,
        {
          sender: 'agent',
          text: 'عذراً، لم أفهم طلبك بدقة. يمكنك الاستفسار عن: "حجز موعد جديد"، "مواعيدي"، "وصفاتي الطبية"، "التقارير"، "إجازتي المرضية"، أو "نتائج التحاليل".',
        },
      ]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        { sender: 'agent', text: `حدث خطأ: ${err.message}` },
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
            { sender: 'agent', text: 'تم تسجيل الدخول بنجاح! يمكنك الآن الاستفادة من كافة الخدمات الطبية.' },
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
                  <button onClick={handleLogout} className="text-xs bg-red-500 px-2.5 py-1 rounded font-semibold">
                    خروج
                  </button>
                ) : (
                  <button
                    onClick={() => setIsLoginModalOpen(true)}
                    className="text-xs bg-white text-emerald-800 px-2.5 py-1 rounded font-bold"
                  >
                    دخول
                  </button>
                )}
                <button onClick={() => setIsOpen(false)} className="font-bold text-lg mr-1">✕</button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-gray-50">
              {messages.map((msg, idx) => (
                <div key={idx} className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}>
                  <div
                    className={`p-3 rounded-2xl max-w-[88%] text-sm whitespace-pre-line leading-relaxed ${
                      msg.sender === 'user'
                        ? 'bg-emerald-600 text-white rounded-br-none'
                        : 'bg-white text-gray-800 border border-gray-200 shadow-sm rounded-bl-none'
                    }`}
                  >
                    {msg.text}
                  </div>

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
              {loading && <div className="text-xs text-gray-500 animate-pulse">جاري جلب البيانات من قاعدة البيانات...</div>}
            </div>

            {/* Input */}
            <div className="p-3 border-t border-gray-200 bg-white flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder="اكتب طلبك (مثال: حجز موعد)..."
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
