<template>
  <el-container class="layout">
    <el-aside width="220px" class="aside">
      <div class="logo">
        <el-icon :size="22"><Brush /></el-icon>
        <span>艺术培训学校</span>
      </div>
      <el-menu :default-active="$route.path" router background-color="#1d2939" text-color="#cbd5e1" active-text-color="#ffffff">
        <el-menu-item index="/dashboard"><el-icon><Odometer /></el-icon>工作台</el-menu-item>
        <el-menu-item index="/students"><el-icon><User /></el-icon>学员管理</el-menu-item>
        <el-menu-item index="/parents"><el-icon><Avatar /></el-icon>家长管理</el-menu-item>
        <el-menu-item index="/teachers"><el-icon><Suitcase /></el-icon>老师管理</el-menu-item>
        <el-menu-item index="/courses"><el-icon><Collection /></el-icon>课程科目</el-menu-item>
        <el-menu-item index="/classes"><el-icon><Calendar /></el-icon>班级排课</el-menu-item>
        <el-menu-item index="/lessons"><el-icon><Tickets /></el-icon>课表与预约</el-menu-item>
        <el-menu-item index="/packages"><el-icon><Wallet /></el-icon>课时包</el-menu-item>
        <el-menu-item index="/payments"><el-icon><Money /></el-icon>缴费管理</el-menu-item>
      </el-menu>
    </el-aside>
    <el-container>
      <el-header class="header">
        <span class="page-title">{{ $route.meta?.title || '' }}</span>
        <el-dropdown @command="onCommand">
          <span class="user">
            <el-icon><UserFilled /></el-icon>
            {{ profile.name || profile.username }}
            <el-tag size="small" :type="profile.role === 'super' ? 'danger' : 'info'" style="margin-left: 6px">
              {{ profile.role === 'super' ? '超管' : '教务' }}
            </el-tag>
          </span>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="logout">退出登录</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </el-header>
      <el-main class="main">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup>
import { computed } from 'vue';
import { useRouter } from 'vue-router';

const router = useRouter();
const profile = computed(() => JSON.parse(localStorage.getItem('profile') || '{}'));

function onCommand(cmd) {
  if (cmd === 'logout') {
    localStorage.removeItem('token');
    localStorage.removeItem('profile');
    router.push('/login');
  }
}
</script>

<style scoped>
.layout {
  height: 100vh;
}
.aside {
  background: #1d2939;
  overflow-x: hidden;
}
.logo {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #fff;
  font-size: 17px;
  font-weight: 600;
  padding: 18px 20px;
}
.aside :deep(.el-menu) {
  border-right: none;
}
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #fff;
  border-bottom: 1px solid #e5e7eb;
}
.page-title {
  font-size: 16px;
  font-weight: 600;
}
.user {
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  outline: none;
}
.main {
  background: #f5f7fa;
}
</style>
