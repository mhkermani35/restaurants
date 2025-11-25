import React, { useState, useEffect } from 'react';
// وارد کردن ماژول‌های لازم Firebase از طریق CDN
// این روش تضمین می‌کند که کد در محیط Canvas بدون نصب NPM کار می‌کند.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js';
import { 
    getFirestore, 
    doc, 
    collection, 
    onSnapshot, 
    query, 
    addDoc, 
    updateDoc, 
    deleteDoc,
    serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';

// -------------------------------------------------------------------------
// توابع کمکی برای نمایش ستاره‌ها (Star Rating Component)
// -------------------------------------------------------------------------

/**
 * مؤلفه نمایش امتیاز به صورت ستاره‌ای (نصفه و کامل)
 * @param {object} props
 * @param {number} props.rating - امتیاز عددی (مانند 4.5)
 * @param {string} props.size - کلاس Tailwind برای اندازه فونت
 */
const StarRating = ({ rating, size = 'text-xl' }) => {
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 !== 0;
    const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);

    return (
        // dir="ltr" برای اطمینان از نمایش صحیح ستاره‌ها از چپ به راست
        <div className="flex items-center space-x-0.5" dir="ltr">
            {[...Array(fullStars)].map((_, i) => (
                <span key={`full-${i}`} className={`${size} text-yellow-400`}>★</span>
            ))}
            {hasHalfStar && (
                <span className={`${size} text-yellow-400 relative`}>
                    {/* ستاره کامل که نصف آن پنهان است */}
                    <span className="absolute overflow-hidden" style={{ width: '50%' }}>★</span>
                    {/* ستاره خالی (باقیمانده) */}
                    <span className="text-gray-300">★</span>
                </span>
            )}
            {[...Array(emptyStars)].map((_, i) => (
                <span key={`empty-${i}`} className={`${size} text-gray-300`}>★</span>
            ))}
        </div>
    );
};

// -------------------------------------------------------------------------
// توابع کمکی برای ساخت مسیرهای Firestore
// -------------------------------------------------------------------------

/**
 * ساخت مسیر کلکسیون امتیازات یک رستوران خاص در فضای خصوصی کاربر
 * @param {string} appId - شناسه برنامه
 * @param {string} userId - شناسه کاربر
 * @param {string} restaurantId - شناسه رستوران
 * @returns {string} مسیر کامل کلکسیون
 */
const getPrivateUserRatingsCollectionPath = (appId, userId, restaurantId) => 
    `artifacts/${appId}/users/${userId}/restaurants/${restaurantId}/ratings`;

// -------------------------------------------------------------------------
// مؤلفه اصلی برنامه (App Component)
// -------------------------------------------------------------------------
export default function RestaurantRatingApp() {
    // --- مدیریت وضعیت (State Management) ---
    const [db, setDb] = useState(null);
    const [auth, setAuth] = useState(null);
    const [userId, setUserId] = useState(null);
    const [restaurants, setRestaurants] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [newRestaurantName, setNewRestaurantName] = useState('');
    const [newRating, setNewRating] = useState(5);
    const [newComment, setNewComment] = useState('');
    const [selectedRestaurant, setSelectedRestaurant] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // --- ۱. تنظیمات و احراز هویت Firebase ---
    useEffect(() => {
        const initializeFirebase = async () => {
            try {
                // دریافت متغیرهای سراسری
                const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
                const firebaseConfig = JSON.parse(typeof __firebase_config !== 'undefined' ? __firebase_config : '{}');
                const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

                // مقداردهی اولیه برنامه Firebase
                const app = initializeApp(firebaseConfig);
                const firestoreDb = getFirestore(app);
                const firestoreAuth = getAuth(app);

                setDb(firestoreDb);
                setAuth(firestoreAuth);

                // مدیریت تغییرات وضعیت احراز هویت
                const unsubscribe = onAuthStateChanged(firestoreAuth, async (user) => {
                    if (user) {
                        setUserId(user.uid);
                    } else {
                        // تلاش برای ورود با توکن سفارشی یا به صورت ناشناس
                        if (initialAuthToken) {
                            await signInWithCustomToken(firestoreAuth, initialAuthToken);
                        } else {
                            await signInAnonymously(firestoreAuth);
                        }
                    }
                    setIsAuthReady(true);
                    setLoading(false); // پایان بارگذاری اولیه بعد از تلاش برای احراز هویت
                });

                return () => unsubscribe();

            } catch (err) {
                console.error("Error initializing Firebase:", err);
                setError(`خطا در راه‌اندازی: ${err.message}.`);
                setLoading(false);
            }
        };

        initializeFirebase();
    }, []);

    // --- ۲. واکشی داده‌های رستوران‌ها (Realtime) ---
    useEffect(() => {
        // تنها زمانی اجرا می‌شود که احراز هویت کامل و userId مشخص باشد
        if (!isAuthReady || !db || !userId) return;

        setLoading(true);

        const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
        // مسیر کلکسیون رستوران‌های مخصوص این کاربر
        const restaurantsColRef = collection(db, `artifacts/${appId}/users/${userId}/restaurants`);
        
        // گوش دادن به تغییرات در زمان واقعی (onSnapshot)
        const unsubscribe = onSnapshot(restaurantsColRef, (snapshot) => {
            const fetchedRestaurants = [];
            snapshot.forEach((doc) => {
                const data = doc.data();
                if (data.name) {
                    fetchedRestaurants.push({
                        id: doc.id,
                        name: data.name,
                        averageRating: data.averageRating || 0,
                        ratingCount: data.ratingCount || 0,
                    });
                }
            });
            // مرتب‌سازی بر اساس نام به زبان فارسی
            fetchedRestaurants.sort((a, b) => a.name.localeCompare(b.name, 'fa'));
            setRestaurants(fetchedRestaurants);
            setLoading(false);
            setError(null);
        }, (err) => {
            console.error("Error fetching restaurants:", err);
            setError("خطا در دریافت لیست رستوران‌ها.");
            setLoading(false);
        });

        return () => unsubscribe(); // تابع پاکسازی
    }, [db, userId, isAuthReady]); 

    // --- ۳. توابع CRUD (ایجاد، به‌روزرسانی، حذف) ---

    // افزودن رستوران جدید
    const handleAddRestaurant = async (e) => {
        e.preventDefault();
        if (!newRestaurantName.trim() || !db || !userId || isSaving) return;

        setIsSaving(true);
        const name = newRestaurantName.trim();
        
        try {
            const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
            const restaurantsColRef = collection(db, `artifacts/${appId}/users/${userId}/restaurants`);

            await addDoc(restaurantsColRef, {
                name: name,
                averageRating: 0,
                ratingCount: 0,
                createdAt: serverTimestamp(),
            });

            setNewRestaurantName('');
        } catch (err) {
            console.error("Error adding restaurant:", err);
            setError(`عملیات افزودن رستوران ناموفق بود: ${err.message}`);
        } finally {
            setIsSaving(false);
        }
    };

    // افزودن امتیاز جدید برای یک رستوران
    const handleAddRating = async (e) => {
        e.preventDefault();
        if (!selectedRestaurant || !newComment.trim() || newRating < 1 || newRating > 5 || !db || !userId || isSaving) return;

        setIsSaving(true);
        
        try {
            const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
            const restaurantId = selectedRestaurant.id;
            
            // ثبت امتیاز در زیرمجموعه
            const ratingsColRef = collection(db, getPrivateUserRatingsCollectionPath(appId, userId, restaurantId));
            await addDoc(ratingsColRef, {
                rating: newRating,
                comment: newComment.trim(),
                createdAt: serverTimestamp(),
            });

            // بستن پنجره مودال و ریست وضعیت
            setSelectedRestaurant(null);
            setNewComment('');
            setNewRating(5);

        } catch (err) {
            console.error("Error adding rating:", err);
            setError(`عملیات ثبت امتیاز ناموفق بود: ${err.message}`);
        } finally {
            setIsSaving(false);
        }
    };

    // حذف رستوران
    const handleDeleteRestaurant = async (restaurantId) => {
        // استفاده از window.confirm به جای alert/confirm برای جلوگیری از بلوکه شدن iframe
        if (!window.confirm('آیا مطمئنید می‌خواهید این رستوران و تمام امتیازات آن را حذف کنید؟ این عمل بازگشت ناپذیر است.')) return;
        if (!db || !userId || isSaving) return;

        setIsSaving(true);
        try {
            const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
            const docRef = doc(db, `artifacts/${appId}/users/${userId}/restaurants`, restaurantId);
            await deleteDoc(docRef);
            // توجه: زیرمجموعه 'ratings' در واقعیت باید با Cloud Function حذف شود تا فضای ابری اشغال نشود.
        } catch (err) {
            console.error("Error deleting restaurant:", err);
            setError(`عملیات حذف ناموفق بود: ${err.message}`);
        } finally {
            setIsSaving(false);
        }
    };
    
    // -------------------------------------------------------------------------
    // مؤلفه لیست امتیازات (در داخل App Component برای دسترسی به Stateهای مرکزی)
    // -------------------------------------------------------------------------

    const RatingsList = ({ restaurant, db, userId, appId }) => {
        const [ratings, setRatings] = useState([]);
        const [listLoading, setListLoading] = useState(true);

        useEffect(() => {
            if (!db || !userId) return;

            setListLoading(true);
            // مسیر کلکسیون امتیازات
            const ratingsColRef = collection(db, getPrivateUserRatingsCollectionPath(appId, userId, restaurant.id));
            const q = query(ratingsColRef);

            const unsubscribe = onSnapshot(q, (snapshot) => {
                const fetchedRatings = [];
                let totalRating = 0;
                let count = 0;

                snapshot.forEach((doc) => {
                    const data = doc.data();
                    if (data.rating) {
                        fetchedRatings.push({
                            id: doc.id,
                            rating: data.rating,
                            comment: data.comment || 'بدون نظر',
                            // تبدیل Timestamp به آبجکت Date
                            createdAt: data.createdAt ? data.createdAt.toDate() : new Date(),
                        });
                        totalRating += data.rating;
                        count++;
                    }
                });

                // مرتب‌سازی بر اساس زمان ایجاد (جدیدترین اول)
                fetchedRatings.sort((a, b) => b.createdAt - a.createdAt);
                setRatings(fetchedRatings);
                setListLoading(false);

                // محاسبه و به‌روزرسانی میانگین در سند اصلی رستوران
                if (count > 0 || restaurant.ratingCount > 0) {
                    const newAverage = count > 0 ? totalRating / count : 0;
                    const restaurantDocRef = doc(db, `artifacts/${appId}/users/${userId}/restaurants`, restaurant.id);
                    // به‌روزرسانی سند رستوران با میانگین جدید و تعداد
                    updateDoc(restaurantDocRef, {
                        averageRating: parseFloat(newAverage.toFixed(1)), // گرد کردن
                        ratingCount: count,
                    }).catch(err => {
                        console.error("خطا در به‌روزرسانی میانگین امتیاز:", err);
                    });
                }
            }, (err) => {
                console.error("Error fetching ratings:", err);
                setListLoading(false);
            });

            return () => unsubscribe();
        }, [db, userId, restaurant.id, appId]); // وابستگی‌ها

        // حالت‌های نمایش
        if (listLoading) return <div className="text-center py-4 text-gray-500">در حال بارگذاری امتیازات...</div>;
        if (ratings.length === 0) return <div className="text-center py-4 text-gray-500">تاکنون امتیازی ثبت نشده است.</div>;

        return (
            <div className="space-y-4">
                {ratings.map((rating) => (
                    <div key={rating.id} className="p-4 bg-white rounded-xl shadow-md border border-gray-100">
                        <div className="flex justify-between items-center mb-2">
                            <StarRating rating={rating.rating} size="text-lg" />
                            <span className="text-sm text-gray-500">
                                {rating.createdAt.toLocaleDateString('fa-IR')}
                            </span>
                        </div>
                        <p className="text-gray-700 leading-relaxed">
                            {rating.comment}
                        </p>
                    </div>
                ))}
            </div>
        );
    };
    
    // --- ۴. رندر رابط کاربری اصلی ---

    // حالت بارگذاری اولیه
    if (loading && !isAuthReady) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="p-8 bg-white rounded-2xl shadow-xl">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-green-500 mx-auto"></div>
                    <p className="mt-4 text-gray-700 text-lg">در حال آماده‌سازی و اتصال به Firebase...</p>
                </div>
            </div>
        );
    }
    
    // حالت خطا
    if (error) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-red-50">
                <div className="p-8 bg-white rounded-2xl shadow-xl border border-red-300">
                    <h2 className="text-xl font-bold text-red-600 mb-4">خطای بحرانی</h2>
                    <p className="text-gray-700">{error}</p>
                </div>
            </div>
        );
    }

    const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

    return (
        <div className="min-h-screen bg-gray-50 p-4 sm:p-8" dir="rtl">
            <header className="mb-8 text-center">
                <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-800 border-b-4 border-green-500 pb-2 inline-block">
                    دفترچه شخصی امتیازدهی رستوران‌ها
                </h1>
                <p className="text-sm text-gray-500 mt-2">
                    شناسه کاربری شما: <code className="bg-gray-200 p-1 rounded text-xs">{userId}</code>
                </p>
            </header>

            <div className="max-w-4xl mx-auto">
                {/* بخش افزودن رستوران جدید */}
                <form onSubmit={handleAddRestaurant} className="mb-8 p-6 bg-white rounded-2xl shadow-lg border border-gray-100">
                    <h2 className="text-2xl font-semibold text-gray-700 mb-4 flex items-center">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-green-500 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        افزودن رستوران جدید
                    </h2>
                    <div className="flex flex-col sm:flex-row space-y-4 sm:space-y-0 sm:space-x-4 sm:space-x-reverse">
                        <input
                            type="text"
                            value={newRestaurantName}
                            onChange={(e) => setNewRestaurantName(e.target.value)}
                            placeholder="نام رستوران (مثلاً: رستوران سنتی نگین)"
                            className="flex-grow p-3 border border-gray-300 rounded-xl focus:ring-green-500 focus:border-green-500 transition duration-150 text-right"
                            required
                            disabled={isSaving}
                        />
                        <button
                            type="submit"
                            className={`p-3 text-white font-medium rounded-xl shadow-md transition duration-150 ${
                                newRestaurantName.trim() && !isSaving
                                    ? 'bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-4 focus:ring-green-300'
                                    : 'bg-gray-400 cursor-not-allowed'
                            }`}
                            disabled={!newRestaurantName.trim() || isSaving}
                        >
                            {isSaving ? (
                                <div className="flex items-center justify-center">
                                    <svg className="animate-spin h-5 w-5 mr-2 text-white" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    در حال ذخیره...
                                </div>
                            ) : (
                                'ثبت رستوران'
                            )}
                        </button>
                    </div>
                </form>

                {/* لیست رستوران‌های موجود */}
                <h2 className="text-2xl font-semibold text-gray-700 mb-4 border-b pb-2 flex items-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-indigo-500 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                    رستوران‌های ثبت شده ({restaurants.length})
                </h2>

                {loading ? (
                    <div className="p-6 text-center text-gray-500 bg-white rounded-2xl shadow-md">
                        در حال بارگذاری لیست رستوران‌ها...
                    </div>
                ) : restaurants.length === 0 ? (
                    <div className="p-6 text-center text-gray-500 bg-white rounded-2xl shadow-md">
                        هنوز رستورانی ثبت نکرده‌اید.
                    </div>
                ) : (
                    <div className="space-y-4">
                        {restaurants.map((restaurant) => (
                            <div key={restaurant.id} className="bg-white rounded-2xl shadow-md overflow-hidden transition-all duration-300 hover:shadow-lg">
                                <div className="p-4 flex justify-between items-center border-b">
                                    <div className="flex items-center space-x-3 space-x-reverse">
                                        <h3 className="text-lg font-bold text-gray-800">{restaurant.name}</h3>
                                        <StarRating rating={restaurant.averageRating} size="text-xl" />
                                        <span className="text-sm text-gray-500">({restaurant.ratingCount} امتیاز)</span>
                                    </div>
                                    <div className="flex space-x-2 space-x-reverse">
                                        <button
                                            onClick={() => setSelectedRestaurant(restaurant)}
                                            className="p-2 bg-indigo-500 text-white rounded-full hover:bg-indigo-600 transition duration-150 shadow-sm"
                                            title="افزودن امتیاز"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                              <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                                            </svg>
                                        </button>
                                        <button
                                            onClick={() => handleDeleteRestaurant(restaurant.id)}
                                            className="p-2 bg-red-500 text-white rounded-full hover:bg-red-600 transition duration-150 shadow-sm"
                                            title="حذف رستوران"
                                            disabled={isSaving}
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                              <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                                            </svg>
                                        </button>
                                    </div>
                                </div>
                                
                                {/* بخش نمایش امتیازات */}
                                <div className="p-4 bg-gray-50">
                                    <h4 className="font-semibold text-gray-600 mb-2 border-b border-gray-200 pb-1">جزئیات امتیازات:</h4>
                                    <RatingsList 
                                        restaurant={restaurant} 
                                        db={db} 
                                        userId={userId} 
                                        appId={appId} 
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Modal/پنجره مودال برای ثبت امتیاز جدید */}
            {selectedRestaurant && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl p-6 relative" dir="rtl">
                        {/* دکمه بستن مودال */}
                        <button
                            onClick={() => setSelectedRestaurant(null)}
                            className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition"
                            disabled={isSaving}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>

                        <h3 className="text-2xl font-bold text-indigo-600 mb-4 border-b pb-2">
                            ثبت امتیاز برای {selectedRestaurant.name}
                        </h3>

                        <form onSubmit={handleAddRating} className="space-y-4">
                            <div>
                                <label className="block text-gray-700 font-medium mb-2">امتیاز شما (از ۱ تا ۵ ستاره):</label>
                                <div className="flex justify-center mb-4">
                                    <input
                                        type="range"
                                        min="1"
                                        max="5"
                                        step="0.5"
                                        value={newRating}
                                        onChange={(e) => setNewRating(parseFloat(e.target.value))}
                                        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                                        disabled={isSaving}
                                    />
                                </div>
                                <div className="text-center">
                                    <StarRating rating={newRating} size="text-3xl" />
                                    <span className="text-xl font-semibold text-gray-700 mr-2">({newRating})</span>
                                </div>
                            </div>
                            
                            <div>
                                <label htmlFor="comment" className="block text-gray-700 font-medium mb-2">نظر و توضیحات:</label>
                                <textarea
                                    id="comment"
                                    rows="4"
                                    value={newComment}
                                    onChange={(e) => setNewComment(e.target.value)}
                                    placeholder="تجربه خود را از این رستوران بنویسید..."
                                    className="w-full p-3 border border-gray-300 rounded-xl focus:ring-indigo-500 focus:border-indigo-500 transition duration-150 text-right"
                                    required
                                    disabled={isSaving}
                                ></textarea>
                            </div>

                            <button
                                type="submit"
                                className={`w-full p-3 text-white font-bold rounded-xl shadow-lg transition duration-150 ${
                                    newComment.trim() && !isSaving
                                        ? 'bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-4 focus:ring-indigo-300'
                                        : 'bg-gray-400 cursor-not-allowed'
                                }`}
                                disabled={!newComment.trim() || isSaving}
                            >
                                {isSaving ? (
                                    <div className="flex items-center justify-center">
                                        <svg className="animate-spin h-5 w-5 mr-2 text-white" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        در حال ذخیره...
                                    </div>
                                ) : (
                                    'ثبت امتیاز'
                                )}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}