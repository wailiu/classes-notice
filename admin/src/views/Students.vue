<template>
  <el-card shadow="never">
    <div class="toolbar">
      <el-input v-model="query.keyword" placeholder="搜索姓名" clearable style="width: 200px" @keyup.enter="load" />
      <el-select v-model="query.status" placeholder="状态" clearable style="width: 120px">
        <el-option label="在读" value="active" />
        <el-option label="停课" value="inactive" />
      </el-select>
      <el-button type="primary" @click="load">查询</el-button>
      <el-button type="success" @click="openForm()">新增学员</el-button>
    </div>

    <el-table :data="items" v-loading="loading">
      <el-table-column label="ID" prop="id" width="60" />
      <el-table-column label="姓名" prop="name" width="110" />
      <el-table-column label="性别" width="70">
        <template #default="{ row }">{{ genderText(row.gender) }}</template>
      </el-table-column>
      <el-table-column label="生日" prop="birthday" width="110" />
      <el-table-column label="家长">
        <template #default="{ row }">
          <el-tag v-for="link in row.parentLinks" :key="link.id" size="small" style="margin-right: 4px">
            {{ link.parent?.name }}({{ link.relation }})
          </el-tag>
          <span v-if="!row.parentLinks?.length" style="color: #c0c4cc">未关联</span>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="80">
        <template #default="{ row }">
          <el-tag size="small" :type="row.status === 'active' ? 'success' : 'info'">
            {{ row.status === 'active' ? '在读' : '停课' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="备注" prop="remark" show-overflow-tooltip />
      <el-table-column label="操作" width="240" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openForm(row)">编辑</el-button>
          <el-button link type="primary" @click="openParents(row)">关联家长</el-button>
          <el-button link type="primary" @click="openDetail(row)">详情</el-button>
          <el-popconfirm title="确认删除该学员?" @confirm="onDelete(row)">
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

    <!-- 新增/编辑 -->
    <el-dialog v-model="formVisible" :title="form.id ? '编辑学员' : '新增学员'" width="480px">
      <el-form :model="form" label-width="70px">
        <el-form-item label="姓名" required>
          <el-input v-model="form.name" />
        </el-form-item>
        <el-form-item label="性别">
          <el-radio-group v-model="form.gender">
            <el-radio value="male">男</el-radio>
            <el-radio value="female">女</el-radio>
            <el-radio value="unknown">未知</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="生日">
          <el-date-picker v-model="form.birthday" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
        <el-form-item label="状态">
          <el-radio-group v-model="form.status">
            <el-radio value="active">在读</el-radio>
            <el-radio value="inactive">停课</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.remark" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="formVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="onSave">保存</el-button>
      </template>
    </el-dialog>

    <!-- 关联家长 -->
    <el-dialog v-model="parentsVisible" title="关联家长" width="560px">
      <div v-for="(link, i) in parentLinks" :key="i" class="link-row">
        <el-select v-model="link.parentId" filterable placeholder="选择家长" style="flex: 1">
          <el-option v-for="p in allParents" :key="p.id" :label="`${p.name} (${p.phone})`" :value="p.id" />
        </el-select>
        <el-select v-model="link.relation" style="width: 110px">
          <el-option v-for="r in ['爸爸', '妈妈', '爷爷', '奶奶', '外公', '外婆', '家长']" :key="r" :label="r" :value="r" />
        </el-select>
        <el-button type="danger" link @click="parentLinks.splice(i, 1)">移除</el-button>
      </div>
      <el-button style="margin-top: 8px" @click="parentLinks.push({ parentId: null, relation: '家长' })">
        + 添加家长
      </el-button>
      <template #footer>
        <el-button @click="parentsVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="onSaveParents">保存</el-button>
      </template>
    </el-dialog>

    <!-- 详情 -->
    <el-drawer v-model="detailVisible" title="学员详情" size="560px">
      <template v-if="detail">
        <el-descriptions :column="2" border size="small">
          <el-descriptions-item label="姓名">{{ detail.name }}</el-descriptions-item>
          <el-descriptions-item label="性别">{{ genderText(detail.gender) }}</el-descriptions-item>
          <el-descriptions-item label="生日">{{ detail.birthday || '-' }}</el-descriptions-item>
          <el-descriptions-item label="状态">{{ detail.status === 'active' ? '在读' : '停课' }}</el-descriptions-item>
          <el-descriptions-item label="备注" :span="2">{{ detail.remark || '-' }}</el-descriptions-item>
        </el-descriptions>
        <h4>课时包</h4>
        <el-table :data="detail.packages" size="small">
          <el-table-column label="名称" prop="name" />
          <el-table-column label="课种" width="110">
            <template #default="{ row }">{{ row.course?.name || '未绑定(不可约)' }}</template>
          </el-table-column>
          <el-table-column label="剩余/总数" width="90">
            <template #default="{ row }">{{ row.remainingLessons }}/{{ row.totalLessons }}</template>
          </el-table-column>
          <el-table-column label="有效期至" prop="validUntil" width="105" />
        </el-table>
        <h4>最近预约</h4>
        <el-table :data="detail.bookings" size="small">
          <el-table-column label="日期" width="100">
            <template #default="{ row }">{{ row.lesson?.date }}</template>
          </el-table-column>
          <el-table-column label="课程">
            <template #default="{ row }">{{ row.lesson?.classEntity?.name }}</template>
          </el-table-column>
          <el-table-column label="状态" width="90">
            <template #default="{ row }">
              <el-tag size="small" :type="bookingTagType(row.status)">{{ bookingText(row.status) }}</el-tag>
            </template>
          </el-table-column>
        </el-table>
      </template>
    </el-drawer>
  </el-card>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import {
  listStudents,
  createStudent,
  updateStudent,
  deleteStudent,
  getStudent,
  listParents,
  setStudentParents,
} from '../api';

const items = ref([]);
const total = ref(0);
const loading = ref(false);
const saving = ref(false);
const query = reactive({ keyword: '', status: '', page: 1, pageSize: 20 });

const formVisible = ref(false);
const form = reactive({ id: null, name: '', gender: 'unknown', birthday: '', status: 'active', remark: '' });

const parentsVisible = ref(false);
const parentLinks = ref([]);
const allParents = ref([]);
const currentStudent = ref(null);

const detailVisible = ref(false);
const detail = ref(null);

function genderText(g) {
  return { male: '男', female: '女' }[g] || '未知';
}
function bookingText(s) {
  return { booked: '已预约', checked_in: '已签到', cancelled: '已取消', no_show: '缺勤' }[s] || s;
}
function bookingTagType(s) {
  return { booked: 'primary', checked_in: 'success', cancelled: 'info', no_show: 'danger' }[s] || 'info';
}

async function load() {
  loading.value = true;
  try {
    const res = await listStudents(query);
    items.value = res.items;
    total.value = res.total;
  } finally {
    loading.value = false;
  }
}

function openForm(row) {
  Object.assign(form, row
    ? { id: row.id, name: row.name, gender: row.gender, birthday: row.birthday || '', status: row.status, remark: row.remark || '' }
    : { id: null, name: '', gender: 'unknown', birthday: '', status: 'active', remark: '' });
  formVisible.value = true;
}

async function onSave() {
  if (!form.name.trim()) {
    ElMessage.warning('请填写姓名');
    return;
  }
  saving.value = true;
  try {
    const data = { name: form.name, gender: form.gender, birthday: form.birthday || undefined, status: form.status, remark: form.remark || undefined };
    if (form.id) await updateStudent(form.id, data);
    else await createStudent(data);
    ElMessage.success('保存成功');
    formVisible.value = false;
    load();
  } finally {
    saving.value = false;
  }
}

async function onDelete(row) {
  await deleteStudent(row.id);
  ElMessage.success('已删除');
  load();
}

async function openParents(row) {
  currentStudent.value = row;
  const res = await listParents({ pageSize: 100 });
  allParents.value = res.items;
  parentLinks.value = (row.parentLinks || []).map((l) => ({ parentId: l.parentId, relation: l.relation }));
  parentsVisible.value = true;
}

async function onSaveParents() {
  const links = parentLinks.value.filter((l) => l.parentId);
  saving.value = true;
  try {
    await setStudentParents(currentStudent.value.id, links);
    ElMessage.success('已保存');
    parentsVisible.value = false;
    load();
  } finally {
    saving.value = false;
  }
}

async function openDetail(row) {
  detail.value = await getStudent(row.id);
  detailVisible.value = true;
}

onMounted(load);
</script>

<style scoped>
.toolbar {
  display: flex;
  gap: 8px;
  margin-bottom: 14px;
}
.link-row {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
  align-items: center;
}
</style>
