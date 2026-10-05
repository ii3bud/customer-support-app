'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (user: any) => void;
}

export default function LoginModal({ isOpen, onClose, onSuccess }: LoginModalProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSigningUp, setIsSigningUp] = useState(false);
  const [fullName, setFullName] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');

    try {
      if (isSigningUp) {
        // 1. إنشاء حساب جديد في Supabase Auth
        const { data: authData, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
        });

        if (signUpError) throw signUpError;

        if (authData.user) {
          // 2. إضافة ملف المريض إلى جدول patient_profiles
          const { error: profileError } = await supabase
            .from('patient_profiles')
            .insert([
              {
                id: authData.user.id,
                full_name: fullName,
                national_id: nationalId,
              },
            ]);

          if (profileError) console.error('Error creating profile:', profileError);

          onSuccess(authData.user);
          onClose();
        }
      } else {
        // تسجيل الدخول لحساب موجود
        const { data: authData, error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (signInError) throw signInError;

        if (authData.user) {
          onSuccess(authData.user);
          onClose();
        }
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'حدث خطأ أثناء عملية الدخول');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl text-right dir-rtl">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-gray-800">
            {isSigningUp ? 'إنشاء ملف مريض جديد' : 'تسجيل دخول المريض'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        {errorMsg && (
          <div className="bg-red-50 text-red-600 p-3 rounded-xl text-xs mb-4">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleAuth} className="space-y-4">
          {isSigningUp && (
            <>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">الاسم الكامل</label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full border border-gray-300 rounded-xl p-2.5 text-sm focus:outline-none focus:border-blue-600"
                  placeholder="مثال: عبدالله عمر"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">رقم الهوية / الإقامة</label>
                <input
                  type="text"
                  required
                  value={nationalId}
                  onChange={(e) => setNationalId(e.target.value)}
                  className="w-full border border-gray-300 rounded-xl p-2.5 text-sm focus:outline-none focus:border-blue-600"
                  placeholder="10xxxxxxxx"
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">البريد الإلكتروني</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-gray-300 rounded-xl p-2.5 text-sm focus:outline-none focus:border-blue-600"
              placeholder="patient@example.com"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">كلمة المرور</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-gray-300 rounded-xl p-2.5 text-sm focus:outline-none focus:border-blue-600"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-all text-sm disabled:opacity-50"
          >
            {loading ? 'جاري المعالجة...' : isSigningUp ? 'إنشاء حساب جديد' : 'تسجيل الدخول'}
          </button>
        </form>

        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={() => setIsSigningUp(!isSigningUp)}
            className="text-xs text-blue-600 hover:underline font-semibold"
          >
            {isSigningUp ? 'لديك حساب بالفعل؟ سجل دخولك' : 'ليس لديك حساب؟ أنشئ ملفاً جديداً'}
          </button>
        </div>
      </div>
    </div>
  );
}
