export const dynamic = 'force-dynamic';
import ChatWidget from '../components/ChatWidget';

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-6 text-right" dir="rtl">
      <div className="max-w-2xl text-center space-y-4">
        <h1 className="text-4xl font-bold text-gray-800">
          منصة الدعم الفني والخدمات الذكية
        </h1>
        <p className="text-gray-600">
          مرحباً بك في موقع التجربة الخاص بمشروع وكيل دعم العملاء الذكي. اضغط على أيقونة الشات في الزاوية السفلية لبدء التجربة.
        </p>
      </div>

      <ChatWidget />
    </main>
  );
}
