<template>
  <el-card shadow="never">
    <div class="toolbar">
      <el-button type="success" @click="openForm()">新增科目</el-button>
    </div>
    <el-table :data="items" v-loading="loading">
      <el-table-column label="ID" prop="id" width="60" />
      <el-table-column label="科目" prop="name" width="130" />
      <el-table-column label="简介" prop="description" show-overflow-tooltip />
      <el-table-column label="单课时参考价(元)" prop="unitPrice" width="150" />
      <el-table-column label="状态" width="90">
        <template #default="{ row }">
          <el-tag size="small" :type="row.status === 'active' ? 'success' : 'info'">
            {{ row.status === 'active' ? '开设中' : '停开' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="140" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openForm(row)">编辑</el-button>
          <el-popconfirm title="确认删除该科目?" @confirm="onDelete(row)">
            <template #reference>
              <el-button link type="danger">删除</el-button>
            </template>
          </el-popconfirm>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="formVisible" :title="form.id ? '编辑科目' : '新增科目'" width="460px">
      <el-form :model="form" label-width="110px">
        <el-form-item label="科目名称" required>
          <el-input v-model="form.name" />
        </el-form-item>
        <el-form-item label="简介">
          <el-input v-model="form.description" type="textarea" :rows="2" />
        </el-form-item>
        <el-form-item label="单课时价(元)">
          <el-input-number v-model="form.unitPrice" :min="0" :step="10" style="width: 100%" />
        </el-form-item>
        <el-form-item label="状态">
          <el-radio-group v-model="form.status">
            <el-radio value="active">开设中</el-radio>
            <el-radio value="inactive">停开</el-radio>
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
import { listCourses, createCourse, updateCourse, deleteCourse } from '../api';

const items = ref([]);
const loading = ref(false);
const saving = ref(false);
const formVisible = ref(false);
const form = reactive({ id: null, name: '', description: '', unitPrice: 0, status: 'active' });

async function load() {
  loading.value = true;
  try {
    items.value = await listCourses();
  } finally {
    loading.value = false;
  }
}

function openForm(row) {
  Object.assign(form, row
    ? { id: row.id, name: row.name, description: row.description || '', unitPrice: Number(row.unitPrice), status: row.status }
    : { id: null, name: '', description: '', unitPrice: 0, status: 'active' });
  formVisible.value = true;
}

async function onSave() {
  if (!form.name.trim()) {
    ElMessage.warning('请填写科目名称');
    return;
  }
  saving.value = true;
  try {
    const data = { name: form.name, description: form.description || undefined, unitPrice: form.unitPrice, status: form.status };
    if (form.id) await updateCourse(form.id, data);
    else await createCourse(data);
    ElMessage.success('保存成功');
    formVisible.value = false;
    load();
  } finally {
    saving.value = false;
  }
}

async function onDelete(row) {
  await deleteCourse(row.id);
  ElMessage.success('已删除');
  load();
}

onMounted(load);
</script>

<style scoped>
.toolbar {
  margin-bottom: 14px;
}
</style>
