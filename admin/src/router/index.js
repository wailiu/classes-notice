import { createRouter, createWebHistory } from 'vue-router';

const routes = [
  { path: '/login', name: 'login', component: () => import('../views/Login.vue') },
  {
    path: '/',
    component: () => import('../layout/MainLayout.vue'),
    redirect: '/dashboard',
    children: [
      { path: 'dashboard', name: 'dashboard', component: () => import('../views/Dashboard.vue'), meta: { title: '工作台' } },
      { path: 'students', name: 'students', component: () => import('../views/Students.vue'), meta: { title: '学员管理' } },
      { path: 'parents', name: 'parents', component: () => import('../views/Parents.vue'), meta: { title: '家长管理' } },
      { path: 'teachers', name: 'teachers', component: () => import('../views/Teachers.vue'), meta: { title: '老师管理' } },
      { path: 'courses', name: 'courses', component: () => import('../views/Courses.vue'), meta: { title: '课程科目' } },
      { path: 'classes', name: 'classes', component: () => import('../views/Classes.vue'), meta: { title: '班级排课' } },
      { path: 'lessons', name: 'lessons', component: () => import('../views/Lessons.vue'), meta: { title: '课表与预约' } },
      { path: 'packages', name: 'packages', component: () => import('../views/Packages.vue'), meta: { title: '课时包' } },
      { path: 'payments', name: 'payments', component: () => import('../views/Payments.vue'), meta: { title: '缴费管理' } },
    ],
  },
  { path: '/:pathMatch(.*)*', redirect: '/dashboard' },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach((to) => {
  const token = localStorage.getItem('token');
  if (!token && to.path !== '/login') return '/login';
  if (token && to.path === '/login') return '/dashboard';
  document.title = to.meta?.title ? `${to.meta.title} - 艺术培训学校管理系统` : '艺术培训学校管理系统';
  return true;
});

export default router;
