<template>
  <el-card shadow="never">
    <div class="toolbar">
      <el-input v-model="query.keyword" placeholder="搜索姓名/手机号" clearable style="width: 220px" @keyup.enter="load" />
      <el-button type="primary" @click="load">查询</el-button>
      <el-button type="success" @click="openForm()">新增家长</el-button>
    </div>

    <el-table :data="items" v-loading="loading">
      <el-table-column label="ID" prop="id" width="60" />
      <el-table-column label="姓名" prop="name" width="110" />
      <el-table-column label="手机号" prop="phone" width="130" />
      <el-table-column label="微信绑定" width="200">
        <template #default="{ row }">
          <el-tag v-if="row.wxOpenid" size="small" type="success">{{ row.wxOpenid }}</el-tag>
          <el-tag v-else size="small" type="info">未绑定</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="孩子">
        <template #default="{ row }">
          <el-tag v-for="link in row.studentLinks" :key="link.id" size="small" style="margin-right: 4px">
            {{ link.student?.name }}({{ link.relation }})
          </el-tag>
          <span v-if="!row.studentLinks?.length" style="color: #c0c4cc">-</span>
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

    <el-dialog v-model="formVisible" :title="form.id ? '编辑家长' : '新增家长'" width="460px">
      <el-form :model="form" label-width="100px">
        <el-form-item label="姓名" required>
          <el-input v-model="form.name" />
        </el-form-item>
        <el-form-item label="手机号" required>
          <el-input v-model="form.phone" maxlength="11" />
        </el-form-item>
        <el-form-item label="微信 openid">
          <el-input v-model="form.wxOpenid" placeholder="开发环境可填 mock-parent-x" />
        </el-form-item>
      </el-form>
      <div class="tip">
        提示:绑定 openid 后,该家长在小程序即可自动免登。开发环境可填 mock 值(如 mock-parent-1)配合小程序模拟登录。
      </div>
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
import { listParents, createParent, updateParent, deleteParent } from '../api';

const items = ref([]);
const total = ref(0);
const loading = ref(false);
const saving = ref(false);
const query = reactive({ keyword: '', page: 1, pageSize: 20 });
const formVisible = ref(false);
const form = reactive({ id: null, name: '', phone: '', wxOpenid: '' });

async function load() {
  loading.value = true;
  try {
    const res = await listParents(query);
    items.value = res.items;
    total.value = res.total;
  } finally {
    loading.value = false;
  }
}

function openForm(row) {
  Object.assign(form, row
    ? { id: row.id, name: row.name, phone: row.phone, wxOpenid: row.wxOpenid || '' }
    : { id: null, name: '', phone: '', wxOpenid: '' });
  formVisible.value = true;
}

async function onSave() {
  if (!form.name.trim() || !/^1\d{10}$/.test(form.phone)) {
    ElMessage.warning('请填写姓名和正确的手机号');
    return;
  }
  saving.value = true;
  try {
    const data = { name: form.name, phone: form.phone, wxOpenid: form.wxOpenid || undefined };
    if (form.id) await updateParent(form.id, { ...data, wxOpenid: form.wxOpenid });
    else await createParent(data);
    ElMessage.success('保存成功');
    formVisible.value = false;
    load();
  } finally {
    saving.value = false;
  }
}

async function onDelete(row) {
  await deleteParent(row.id);
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
.tip {
  font-size: 12px;
  color: #909399;
  padding: 0 10px;
}
</style>
