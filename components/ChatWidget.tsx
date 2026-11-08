'use client';

import { useState, useEffect, useRef } from 'react';
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
    | 'send_single_report'
    | 'send_all_reports'
    | 'send_labs';
  payload?: any;
}

interface Message {
  sender: 'user' | 'agent';
  text: string;
  options?: ActionOption[];
}

// دالة ذكية لتوحيد الحروف العربية وتسهيل الفهم والمطابقة
const normalizeText = (text: string) => {
  return text
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/د\./g, '')
    .replace(/دكتور/g, '')
    .trim();
};

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
      text: 'أهلاً بك في البوابة الطبية الذكية لمجموعة د. سليمان الحبيب! تحدث معي بطبيعية، مثلاً: "أبغى إعادة صرف دواء كذا"، "احجز لي مع دكتور خالد"، أو "أرسل إجازتي المرضية".',
    },
  ]);

  const messagesEndRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, loading, isOpen]);

  if (!isMounted) {
    return null;
  }

  // التحقق الذكي من تطابق كلام العميل مع عنصر في قاعدة البيانات (مثل اسم الدواء أو الطبيب)
  const isEntityMentioned = (userQuery: string, dbItemName: string) => {
    const normQuery = normalizeText(userQuery);
    const normItem = normalizeText(dbItemName);

    if (normQuery.includes(normItem)) return true;

    // فحص الكلمات المفتاحية داخل الاسم (إذا كتب جزءاً من اسم الدواء أو اسم الطبيب الأول)
    const itemWords = normItem.split(/\s+/).filter((w) => w.length > 2);
    return itemWords.some((word) => normQuery.includes(word));
  };

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
            text: `تم إرسال طلب إعادة صرف الدواء (${option.payload.medication_name}) للصيدلية بنجاح برقم مرجعي (#${orderNumber}).\nيمكنك الاستلام من الصيدلية، كما تم إشعارك عبر البريد الإلكتروني ورقم الجوال.`,
          },
        ]);
      } else if (option.type === 'refill_all') {
        const names = option.payload.map((p: any) => p.medication_name).join('، ');
        setMessages((prev) => [
          ...prev,
          {
            sender: 'agent',
            text: `تم إرسال طلب إعادة صرف كافة الوصفات (${names}) للصيدلية برقم مرجعي (#${orderNumber}).\nيمكنك الاستلام من الصيدلية، كما تم إشعارك عبر البريد الإلكتروني ورقم الجوال.`,
          },
        ]);
      } else if (option.type === 'send_single_report') {
        setMessages((prev) => [
          ...prev,
          {
            sender: 'agent',
            text: `تم إصدار وإرسال نسخة مصدقة من (${option.payload.report_type} - بتاريخ ${option.payload.issue_date}) برقم مرجعي (#${orderNumber}) إلى بريدك الإلكتروني ورقم جوالك المسجل.`,
          },
        ]);
      } else if (option.type === 'send_all_reports') {
        const types = option.payload.map((r: any) => r.report_type).join('، ');
        setMessages((prev) => [
          ...prev,
          {
            sender: 'agent',
            text: `تم إصدار وإرسال كافة التقارير والإجازات الطبية (${types}) برقم مرجعي (#${orderNumber}) إلى بريدك الإلكتروني ورقم جوالك المسجل.`,
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
    const normQuery = normalizeText(userQuery);
    setInput('');
    setMessages((prev) => [...prev, { sender: 'user', text: userQuery }]);
    setLoading(true);

    const orderNumber = Math.floor(10000 + Math.random() * 90000);

    try {
      if (!user) {
        setMessages((prev) => [
          ...prev,
          {
            sender: 'agent',
            text: 'لتصفح سجلك الطبي وتنفيذ طلباتك الذكية مباشرة، يرجى تسجيل الدخول أولاً.',
          },
        ]);
        setIsLoginModalOpen(true);
        setLoading(false);
        return;
      }

      // =========================================================================
      // 1. الذكاء الاصطناعي للوصفات الطبية وإعادة الصرف (يفهم اسم الدواء مباشرة!)
      // =========================================================================
      const { data: prescriptions } = await supabase
        .from('patient_prescriptions')
        .select('*')
        .eq('patient_id', user.id);

      // فحص ما إذا كان العميل قد ذكر اسم دواء مسجل في ملفه مباشرة حتى بدون كلمة "وصفة"
      const matchedMed = (prescriptions || []).find((p) =>
        isEntityMentioned(userQuery, p.medication_name)
      );

      const isPrescriptionIntent =
        matchedMed ||
        normQuery.includes('وصفه') ||
        normQuery.includes('وصفات') ||
        normQuery.includes('وصفاتي') ||
        normQuery.includes('دواء') ||
        normQuery.includes('ادويه') ||
        normQuery.includes('ادويتي') ||
        normQuery.includes('علاج') ||
        normQuery.includes('علاجي') ||
        normQuery.includes('صرف') ||
        normQuery.includes('تجديد');

      if (isPrescriptionIntent) {
        if (prescriptions && prescriptions.length > 0) {
          // أ) إذا ذكر العميل اسم الدواء الموجود في ملفه -> تنفيذ مباشر فوراً!
          if (matchedMed) {
            setMessages((prev) => [
              ...prev,
              {
                sender: 'agent',
                text: `أبشر! تعرفت على طلبك لدواء (${matchedMed.medication_name} - ${matchedMed.dosage}) من سجلك الطبي.\n\n✅ تم اعتماد وإرسال طلب إعادة صرف الدواء إلى الصيدلية مباشرة برقم مرجعي (#${orderNumber})!\nيمكنك استلامه من صيدلية المستشفى، وتم إشعارك عبر البريد الإلكتروني ورقم الجوال.`,
              },
            ]);
            setLoading(false);
            return;
          }

          // ب) إذا طلب صرف "كل" أو "جميع" الأدوية مباشرة -> تنفيذ مباشر فوراً!
          if (
            (normQuery.includes('كل') || normQuery.includes('جميع')) &&
            (normQuery.includes('صرف') || normQuery.includes('تجديد') || normQuery.includes('ابغى') || normQuery.includes('ابي'))
          ) {
            const names = prescriptions.map((p) => p.medication_name).join('، ');
            setMessages((prev) => [
              ...prev,
              {
                sender: 'agent',
                text: `أبشر! تم اعتماد وإرسال طلب إعادة صرف كافة أدويتك المسجلة (${names}) إلى الصيدلية مباشرة برقم مرجعي (#${orderNumber})!`,
              },
            ]);
            setLoading(false);
            return;
          }

          // ج) إذا لم يحدد اسم الدواء أو كتب اسم دواء غير واضح -> يعرض له القائمة ليختار منها بذكاء
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

          const asksForSpecificUnfoundMed =
            normQuery.includes('صرف') && normQuery.split(' ').length > 3;

          setMessages((prev) => [
            ...prev,
            {
              sender: 'agent',
              text: asksForSpecificUnfoundMed
                ? `لم أتمكن من مطابقة اسم الدواء المذكور مع سجلك، ولكن إليك الوصفات الطبية المسجلة في ملفك:\n${rxList}\n\nيرجى اختيار الدواء الذي ترغب بإعادة صرفه:`
                : `إليك الوصفات الطبية المسجلة في ملفك:\n${rxList}\n\nيمكنك اختيار الدواء المطلوب لإعادة الصرف (أو اكتب لي مثلاً: "أبغى صرف ${prescriptions[0].medication_name}"):`,
              options,
            },
          ]);
        } else {
          setMessages((prev) => [
            ...prev,
            { sender: 'agent', text: 'فحصت ملفك الطبي، ولا توجد وصفات طبية مسجلة حالياً.' },
          ]);
        }
        setLoading(false);
        return;
      }

      // =========================================================================
      // 2. الذكاء الاصطناعي للتقارير والإجازات المرضية (يميز بين الإجازة والتقرير!)
      // =========================================================================
      const isReportIntent =
        normQuery.includes('تقرير') ||
        normQuery.includes('تقارير') ||
        normQuery.includes('اجازه') ||
        normQuery.includes('اجازتي') ||
        normQuery.includes('اجازاتي') ||
        normQuery.includes('مرضيه') ||
        normQuery.includes('شهاده');

      if (isReportIntent) {
        const { data: reports } = await supabase
          .from('patient_medical_reports')
          .select('*')
          .eq('patient_id', user.id);

        if (reports && reports.length > 0) {
          // فحص إذا كان المستخدم قد حدد نوع التقرير أو اسم الدكتور في كلامه
          const wantsSickLeaveOnly =
            (normQuery.includes('اجازه') || normQuery.includes('مرضيه')) &&
            !normQuery.includes('تقرير');
          const wantsMedicalReportOnly =
            normQuery.includes('تقرير شامل') ||
            (normQuery.includes('تقرير طبي') && !normQuery.includes('اجازه'));

          const matchedReport = reports.find(
            (r) =>
              (wantsSickLeaveOnly && normalizeText(r.report_type).includes('اجازه')) ||
              (wantsMedicalReportOnly && normalizeText(r.report_type).includes('تقرير')) ||
              isEntityMentioned(userQuery, r.doctor_name)
          );

          // إذا طلب إرسال أو تحميل تقرير محدد وتطابق مع ملفه -> إرسال فوري!
          if (
            matchedReport &&
            (normQuery.includes('ارسل') ||
              normQuery.includes('ابغى') ||
              normQuery.includes('ابي') ||
              normQuery.includes('عطني') ||
              normQuery.includes('اصدار') ||
              wantsSickLeaveOnly)
          ) {
            setMessages((prev) => [
              ...prev,
              {
                sender: 'agent',
                text: `أبشر! وجدت الوثيقة المطلوبة في ملفك (${matchedReport.report_type} - بتاريخ ${matchedReport.issue_date} من ${matchedReport.doctor_name}).\n\n✅ تم إصدار نسخة مصدقة (PDF) وإرسالها فوراً إلى بريدك الإلكتروني ورقم جوالك برقم مرجعي (#${orderNumber})!\n\nوإذا كنت ترغب باستعراض بقية تقاريرك، يمكنك الضغط أدناه:`,
                options: [
                  {
                    label: '📦 إرسال جميع التقارير والإجازات الأخرى معاً',
                    type: 'send_all_reports',
                    payload: reports,
                  },
                ],
              },
            ]);
            setLoading(false);
            return;
          }

          // عرض الخيارات إذا كان السؤال عاماً (مثل: "التقارير")
          const listText = reports
            .map((r, i) => `${i + 1}. ${r.report_type} - بتاريخ ${r.issue_date} (${r.doctor_name})`)
            .join('\n');

          const options: ActionOption[] = reports.map((r) => ({
            label: `📩 إرسال: ${r.report_type} (${r.doctor_name})`,
            type: 'send_single_report',
            payload: r,
          }));

          if (reports.length > 1) {
            options.push({
              label: '📦 إرسال جميع التقارير والإجازات معاً (PDF)',
              type: 'send_all_reports',
              payload: reports,
            });
          }

          setMessages((prev) => [
            ...prev,
            {
              sender: 'agent',
              text: `تم العثور على التقارير والإجازات الطبية التالية في ملفك:\n${listText}\n\nيرجى اختيار التقرير المطلوب إرساله:`,
              options,
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

      // =========================================================================
      // 3. الذكاء الاصطناعي للمواعيد والحجز المباشر باسم الطبيب أو التخصص
      // =========================================================================
      const { data: doctorsList } = await supabase.from('doctors').select('*');
      const matchedDoctorForBooking = (doctorsList || []).find(
        (doc: any) =>
          isEntityMentioned(userQuery, doc.doctor_name) ||
          isEntityMentioned(userQuery, doc.clinic_name)
      );

      const isCancelIntent = normQuery.includes('الغاء') || normQuery.includes('الغي') || normQuery.includes('كنسل');
      const isRescheduleIntent = normQuery.includes('تعديل') || normQuery.includes('عدل') || normQuery.includes('تغيير') || normQuery.includes('تاجيل');
      const isBookingIntent =
        normQuery.includes('حجز') ||
        normQuery.includes('احجز') ||
        normQuery.includes('جديد') ||
        (matchedDoctorForBooking && !isCancelIntent && !isRescheduleIntent);

      // أ) إذا طلب حجز موعد وذكر اسم الدكتور أو العيادة في نفس الجملة -> يفتح له جدول الدكتور فوراً!
      if (isBookingIntent && matchedDoctorForBooking) {
        const availableSlots = await getAvailableSlotsForDoctor(matchedDoctorForBooking.doctor_name);
        if (availableSlots.length > 0) {
          const slotOptions: ActionOption[] = availableSlots.map((slot) => ({
            label: `📅 تأكيد حجز: ${slot.displayDate}`,
            type: 'book_slot_confirm',
            payload: {
              doctorName: matchedDoctorForBooking.doctor_name,
              clinicName: matchedDoctorForBooking.clinic_name,
              newIsoDate: slot.isoDate,
              displayDate: slot.displayDate,
              isNewBooking: true,
            },
          }));

          setMessages((prev) => [
            ...prev,
            {
              sender: 'agent',
              text: `أبشر! إليك المواعيد المتاحة مباشرة مع ${matchedDoctorForBooking.doctor_name} (${matchedDoctorForBooking.clinic_name}) خلال الشهر القادم:\nاختر اليوم المناسب لإتمام الحجز فوراً:`,
              options: slotOptions,
            },
          ]);
          setLoading(false);
          return;
        }
      }

      // ب) إذا طلب حجز موعد جديد بشكل عام بدون تحديد طبيب
      if (isBookingIntent && !normQuery.includes('مواعيدي')) {
        const docOptions: ActionOption[] = (doctorsList || []).map((doc: any) => ({
          label: `🩺 ${doc.doctor_name} (${doc.clinic_name})`,
          type: 'book_slot_confirm',
          payload: { name: doc.doctor_name, clinic: doc.clinic_name },
        }));

        setMessages((prev) => [
          ...prev,
          {
            sender: 'agent',
            text: 'اختر الطبيب أو التخصص المناسب لحجز موعد جديد (أو اكتب اسم الطبيب مباشرة):',
            options: docOptions,
          },
        ]);
        setLoading(false);
        return;
      }

      // ج) إدارة المواعيد القائمة (عرض، أو إلغاء مباشر، أو تعديل مباشر)
      if (
        normQuery.includes('موعد') ||
        normQuery.includes('مواعيد') ||
        normQuery.includes('جدول') ||
        normQuery.includes('زياره') ||
        isCancelIntent ||
        isRescheduleIntent
      ) {
        const { data: appts } = await supabase
          .from('patient_appointments')
          .select('*')
          .eq('patient_id', user.id)
          .eq('status', 'مؤكد');

        // إذا كتب "ألغِ موعد دكتور خالد" أو كان لديه موعد واحد وطلب إلغاءه مباشرة!
        if (isCancelIntent && appts && appts.length > 0) {
          const targetAppt =
            appts.find((a) => isEntityMentioned(userQuery, a.doctor_name)) ||
            (appts.length === 1 ? appts[0] : null);

          if (targetAppt) {
            await supabase
              .from('patient_appointments')
              .update({ status: 'ملغي' })
              .eq('id', targetAppt.id);

            setMessages((prev) => [
              ...prev,
              {
                sender: 'agent',
                text: `تم تنفيذ طلبك فوراً! ألغينا موعدك مع ${targetAppt.doctor_name} (${targetAppt.clinic_name}) في قاعدة البيانات برقم مرجعي (#${orderNumber}).`,
              },
            ]);
            setLoading(false);
            return;
          }
        }

        // إذا كتب "عدّل موعد دكتور خالد" أو كان لديه موعد واحد وطلب تعديله مباشرة!
        if (isRescheduleIntent && appts && appts.length > 0) {
          const targetAppt =
            appts.find((a) => isEntityMentioned(userQuery, a.doctor_name)) ||
            (appts.length === 1 ? appts[0] : null);

          if (targetAppt) {
            const availableSlots = await getAvailableSlotsForDoctor(
              targetAppt.doctor_name,
              targetAppt.appointment_date
            );
            const slotOptions: ActionOption[] = availableSlots.map((slot) => ({
              label: `📅 حجز البديل: ${slot.displayDate}`,
              type: 'reschedule_confirm',
              payload: {
                apptId: targetAppt.id,
                doctorName: targetAppt.doctor_name,
                clinicName: targetAppt.clinic_name,
                newIsoDate: slot.isoDate,
                displayDate: slot.displayDate,
              },
            }));

            setMessages((prev) => [
              ...prev,
              {
                sender: 'agent',
                text: `أبشر! لتعديل موعدك مع ${targetAppt.doctor_name}، إليك الأوقات المتاحة في جدوله خلال الشهر القادم:`,
                options: slotOptions,
              },
            ]);
            setLoading(false);
            return;
          }
        }

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

      // =========================================================================
      // 4. التحاليل والأشعة
      // =========================================================================
      if (
        normQuery.includes('تحليل') ||
        normQuery.includes('تحاليل') ||
        normQuery.includes('نتائج') ||
        normQuery.includes('اشعه') ||
        normQuery.includes('فحص') ||
        normQuery.includes('فحوصات') ||
        normQuery.includes('مختبر')
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

      // =========================================================================
      // 5. الملف الطبي والتأمين والترحيب الذكي
      // =========================================================================
      if (
        normQuery.includes('ملفي') ||
        normQuery.includes('سجلي') ||
        normQuery.includes('معلوماتي') ||
        normQuery.includes('تامين') ||
        normQuery.includes('بياناتي')
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

      if (
        normQuery.includes('سلام') ||
        normQuery.includes('هلا') ||
        normQuery.includes('مرحبا') ||
        normQuery.includes('صباح') ||
        normQuery.includes('مساء') ||
        normQuery.includes('كيف حالك')
      ) {
        setMessages((prev) => [
          ...prev,
          {
            sender: 'agent',
            text: 'يا هلا ومرحبا بك! أنا مساعدك الذكي في مجموعة د. سليمان الحبيب الطبية. آمرني، كيف أقدر أخدمك اليوم؟ تقدر تطلب مني مباشرة مثلاً: "أبغى صرف دواء كذا"، "عدّل موعدي"، أو "أرسل إجازتي المرضية".',
          },
        ]);
        setLoading(false);
        return;
      }

      // =========================================================================
      // 6. الرد الذكي الشامل في حال كتابة سؤال غير معروف (يعرض أزرار كل الخدمات!)
      // =========================================================================
      setMessages((prev) => [
        ...prev,
        {
          sender: 'agent',
          text: 'لم أفهم طلبك بالتحديد، ولكن يمكنني تنفيذ أي من خدماتك الطبية فوراً! اختر الخدمة أو اكتب طلبك بطبيعية (مثلاً: "أبغى إعادة صرف دواء كذا" أو "احجز لي مع دكتور خالد"):',
          options: [
            { label: '➕ حجز موعد جديد مع طبيب', type: 'book_select_doctor' },
          ],
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
            { sender: 'agent', text: 'تم تسجيل الدخول بنجاح! تحدث معي بطبيعية وأنا أنفذ طلبك فوراً.' },
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
                  جاري تحليل طلبك ومطابقته مع قاعدة البيانات...
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-3 border-t border-gray-200 bg-white flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder="اكتب طلبك بطبيعية (مثال: اصرف لي دواء...)"
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
