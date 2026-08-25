<template>
  <el-card shadow="never">
    <div class="toolbar">
      <el-input v-model="query.keyword" placeholder="搜索姓名/手机号" clearable style="width: 220px" @keyup.enter="load" />
      <el-button type="primary" @click="load">查询</el-button>
      <el-button type="success" @click="openForm()">新增老师</el-button>
    </div>

    <el-table :data="items" v-loading="loading">
      <el-table-column label="ID" prop="id" width="60" />
      <el-table-column label="姓名" prop="name" width="110" />
      <el-table-column label="手机号" prop="phone" width="130" />
      <el-table-column label="擅长科目" prop="subjects" />
      <el-table-column label="微信绑定" width="180">
        <template #default="{ row }">
          <el-tag v-if="row.wxOpenid" size="small" type="success">{{ row.wxOpenid }}</el-tag>
          <el-tag v-else size="small" type="info">未绑定</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="80">
        <template #default="{ row }">
          <el-tag size="small" :type="row.status === 'active' ? 'success' : 'info'">
            {{ row.status === 'active' ? '在职' : '离职' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="140" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openForm(row)">编辑</el-button>
          <el-popconfirm title="确认删除?" @confirm="onDelete(row)">
            <template #reference>
              <el-button link type="danger">删除</el-button>
            </template>
          </el-popconfirm>
        </template>
      </el-table-column>
    </el-table>
    <el-pagination
      style="margin-top: 12px; justify-content: flex-end"
      layout="total, prev, pager, next"
      :total="total"
      :page-size="query.pageSize"
      v-model:current-page="query.page"
      @current-change="load"
    />

    <el-dialog v-model="formVisible" :title="form.id ? '编辑老师' : '新增老师'" width="460px">
      <el-form :model="form" label-width="100px">
        <el-form-item label="姓名" required>
          <el-input v-model="form.name" />
        </el-form-item>
        <el-form-item label="手机号" required>
          <el-input v-model="form.phone" maxlength="11" />
        </el-form-item>
        <el-form-item label="擅长科目">
          <el-input v-model="form.subjects" placeholder="逗号分隔,如: 素描,创意美术" />
        </el-form-item>
        <el-form-item label="微信 openid">
          <el-input v-model="form.wxOpenid" placeholder="开发环境可填 mock-teacher-x" />
        </el-form-item>
        <el-form-item label="状态">
          <el-radio-group v-model="form.status">
            <el-radio value="active">在职</el-radio>
            <el-radio value="inactive">离职</el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="formVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="onSave">保存</el-button>
      </template>
    </el-dialog>
  </el-card>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { listTeachers, createTeacher, updateTeacher, deleteTeacher } from '../api';

const items = ref([]);
const total = ref(0);
const loading = ref(false);
const saving = ref(false);
const query = reactive({ keyword: '', page: 1, pageSize: 20 });
const formVisible = ref(false);
const form = reactive({ id: null, name: '', phone: '', subjects: '', wxOpenid: '', status: 'active' });

async function load() {
  loading.value = true;
  try {
    const res = await listTeachers(query);
    items.value = res.items;
    total.value = res.total;
  } finally {
    loading.value = false;
  }
}

function openForm(row) {
  Object.assign(form, row
    ? { id: row.id, name: row.name, phone: row.phone, subjects: row.subjects || '', wxOpenid: row.wxOpenid || '', status: row.status }
    : { id: null, name: '', phone: '', subjects: '', wxOpenid: '', status: 'active' });
  formVisible.value = true;
}

async function onSave() {
  if (!form.name.trim() || !/^1\d{10}$/.test(form.phone)) {
    ElMessage.warning('请填写姓名和正确的手机号');
    return;
  }
  saving.value = true;
  try {
    const data = { name: form.name, phone: form.phone, subjects: form.subjects || undefined, status: form.status };
    if (form.id) await updateTeacher(form.id, { ...data, wxOpenid: form.wxOpenid });
    else await createTeacher({ ...data, wxOpenid: form.wxOpenid || undefined });
    ElMessage.success('保存成功');
    formVisible.value = false;
    load();
  } finally {
    saving.value = false;
  }
}

async function onDelete(row) {
  await deleteTeacher(row.id);
  ElMessage.success('已删除');
  load();
}

onMounted(load);
</script>

<style scoped>
.toolbar {
  display: flex;
  gap: 8px;
  margin-bottom: 14px;
}
</style>
