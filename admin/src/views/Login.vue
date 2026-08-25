<template>
  <div class="login-page">
    <el-card class="login-card">
      <div class="title">
        <el-icon :size="28" color="#409eff"><Brush /></el-icon>
        <h2>艺术培训学校管理系统</h2>
        <p>素描 · 创意美术 · 书法 · 声乐 · 钢琴 · 古筝 · 架子鼓 · 拉丁舞</p>
      </div>
      <el-form :model="form" @submit.prevent="onSubmit">
        <el-form-item>
          <el-input v-model="form.username" placeholder="用户名" size="large" :prefix-icon="User" />
        </el-form-item>
        <el-form-item>
          <el-input
            v-model="form.password"
            type="password"
            placeholder="密码"
            size="large"
            show-password
            :prefix-icon="Lock"
            @keyup.enter="onSubmit"
          />
        </el-form-item>
        <el-button type="primary" size="large" style="width: 100%" :loading="loading" @click="onSubmit">
          登 录
        </el-button>
        <div class="hint">演示账号:admin / admin123(超管),reception / reception123(前台教务)</div>
      </el-form>
    </el-card>
  </div>
</template>

<script setup>
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { User, Lock } from '@element-plus/icons-vue';
import { login } from '../api';

const router = useRouter();
const loading = ref(false);
const form = reactive({ username: '', password: '' });

async function onSubmit() {
  if (!form.username || !form.password) {
    ElMessage.warning('请输入用户名和密码');
    return;
  }
  loading.value = true;
  try {
    const res = await login(form);
    localStorage.setItem('token', res.token);
    localStorage.setItem('profile', JSON.stringify(res.profile));
    ElMessage.success(`欢迎,${res.profile.name}`);
    router.push('/dashboard');
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.login-page {
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}
.login-card {
  width: 420px;
  padding: 12px 8px;
}
.title {
  text-align: center;
  margin-bottom: 20px;
}
.title h2 {
  margin: 8px 0 4px;
}
.title p {
  color: #909399;
  font-size: 12px;
  margin: 0;
}
.hint {
  margin-top: 14px;
  font-size: 12px;
  color: #909399;
  text-align: center;
}
</style>
