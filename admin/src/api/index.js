import axios from 'axios';
import { ElMessage } from 'element-plus';
import router from '../router';

const http = axios.create({ baseURL: '/api', timeout: 15000 });

http.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

http.interceptors.response.use(
  (res) => res.data,
  (err) => {
    const status = err.response?.status;
    const msg = err.response?.data?.message;
    const text = Array.isArray(msg) ? msg.join(';') : msg || '请求失败,请稍后重试';
    if (status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('profile');
      if (router.currentRoute.value.path !== '/login') router.push('/login');
    }
    ElMessage.error(text);
    return Promise.reject(err);
  },
);

// ---------- 鉴权 ----------
export const login = (data) => http.post('/auth/login', data);
export const getProfile = () => http.get('/auth/profile');

// ---------- 仪表盘 ----------
export const getSummary = () => http.get('/dashboard/summary');
export const getTodayLessons = () => http.get('/dashboard/today-lessons');
export const getLowHours = () => http.get('/dashboard/low-hours');

// ---------- 学员 ----------
export const listStudents = (params) => http.get('/students', { params });
export const getStudent = (id) => http.get(`/students/${id}`);
export const createStudent = (data) => http.post('/students', data);
export const updateStudent = (id, data) => http.put(`/students/${id}`, data);
export const deleteStudent = (id) => http.delete(`/students/${id}`);
export const setStudentParents = (id, links) => http.put(`/students/${id}/parents`, { links });

// ---------- 家长 ----------
export const listParents = (params) => http.get('/parents', { params });
export const createParent = (data) => http.post('/parents', data);
export const updateParent = (id, data) => http.put(`/parents/${id}`, data);
export const deleteParent = (id) => http.delete(`/parents/${id}`);

// ---------- 老师 ----------
export const listTeachers = (params) => http.get('/teachers', { params });
export const createTeacher = (data) => http.post('/teachers', data);
export const updateTeacher = (id, data) => http.put(`/teachers/${id}`, data);
export const deleteTeacher = (id) => http.delete(`/teachers/${id}`);

// ---------- 课程 ----------
export const listCourses = () => http.get('/courses');
export const createCourse = (data) => http.post('/courses', data);
export const updateCourse = (id, data) => http.put(`/courses/${id}`, data);
export const deleteCourse = (id) => http.delete(`/courses/${id}`);

// ---------- 班级 / 课次 ----------
export const listClasses = (params) => http.get('/classes', { params });
export const createClass = (data) => http.post('/classes', data);
export const updateClass = (id, data) => http.put(`/classes/${id}`, data);
export const deleteClass = (id) => http.delete(`/classes/${id}`);
export const generateLessons = (id, data) => http.post(`/classes/${id}/generate-lessons`, data);
export const listLessons = (params) => http.get('/lessons', { params });
export const cancelLesson = (id) => http.post(`/lessons/${id}/cancel`);

// ---------- 课时包 ----------
export const listPackages = (params) => http.get('/packages', { params });
export const createPackage = (data) => http.post('/packages', data);
export const updatePackage = (id, data) => http.put(`/packages/${id}`, data);
export const adjustPackage = (id, delta) => http.post(`/packages/${id}/adjust`, { delta });
export const deletePackage = (id) => http.delete(`/packages/${id}`);

// ---------- 缴费 ----------
export const listPayments = (params) => http.get('/payments', { params });
export const createPayment = (data) => http.post('/payments', data);
export const refundPayment = (id) => http.post(`/payments/${id}/refund`);

// ---------- 预约 ----------
export const listBookings = (params) => http.get('/bookings', { params });
export const createBooking = (data) => http.post('/bookings', data);
export const cancelBooking = (id) => http.post(`/bookings/${id}/cancel`);
export const checkinBooking = (id) => http.post(`/bookings/${id}/checkin`);
export const noShowBooking = (id) => http.post(`/bookings/${id}/no-show`);
