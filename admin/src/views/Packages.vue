<template>
  <el-card shadow="never">
    <div class="toolbar">
      <el-select v-model="query.studentId" filterable clearable placeholder="按学员筛选" style="width: 160px" @change="load">
        <el-option v-for="s in students" :key="s.id" :label="s.name" :value="s.id" />
      </el-select>
      <el-select v-model="query.status" clearable placeholder="状态" style="width: 130px" @change="load">
        <el-option label="生效中" value="active" />
        <el-option label="已用完" value="finished" />
        <el-option label="已过期" value="expired" />
        <el-option label="已退款" value="refunded" />
      </el-select>
      <el-checkbox v-model="onlyLow" @change="load">仅看课时预警(≤3)</el-checkbox>
      <el-button type="primary" @click="load">查询</el-button>
      <el-button type="success" @click="openForm()">报名 / 购课时包</el-button>
    </div>

    <el-table :data="items" v-loading="loading">
      <el-table-column label="ID" prop="id" width="60" />
      <el-table-column label="学员" prop="student.name" width="100" />
      <el-table-column label="课时包" prop="name" min-width="150" />
      <el-table-column label="课种" width="110">
        <template #default="{ row }">
          <span v-if="row.course">{{ row.course.name }}</span>
          <el-tooltip v-else content="历史通用包未绑定课种,已不可用于预约,请编辑处理">
            <el-tag size="small" type="danger">未绑定(不可约)</el-tag>
          </el-tooltip>
        </template>
      </el-table-column>
      <el-table-column label="剩余/总数" width="110">
        <template #default="{ row }">
          <el-tag size="small" :type="row.remainingLessons <= 3 ? 'danger' : 'primary'">
            {{ row.remainingLessons }}/{{ row.totalLessons }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="有效期至" prop="validUntil" width="110">
        <template #default="{ row }">{{ row.validUntil || '不限' }}</template>
      </el-table-column>
      <el-table-column label="状态" width="90">
        <template #default="{ row }">
          <el-tag size="small" :type="{ active: 'success', finished: 'warning', expired: 'info', refunded: 'danger' }[row.status]">
            {{ { active: '生效中', finished: '已用完', expired: '已过期', refunded: '已退款' }[row.status] }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="200" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openAdjust(row)">调整课时</el-button>
          <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
          <el-popconfirm title="确认删除该课时包?" @confirm="onDelete(row)">
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

    <!-- 报名 -->
    <el-dialog v-model="formVisible" title="报名 / 购课时包" width="520px">
      <el-form :model="form" label-width="110px">
        <el-form-item label="学员" required>
          <el-select v-model="form.studentId" filterable style="width: 100%">
            <el-option v-for="s in students" :key="s.id" :label="s.name" :value="s.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="课种" required>
          <el-select v-model="form.courseId" placeholder="必选:课时按课种消耗,不可跨课种使用" style="width: 100%">
            <el-option v-for="c in courses" :key="c.id" :label="c.name" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="课时包名称" required>
          <el-input v-model="form.name" placeholder="如: 钢琴48课时包" />
        </el-form-item>
        <el-form-item label="课时数" required>
          <el-input-number v-model="form.totalLessons" :min="1" :max="500" />
        </el-form-item>
        <el-form-item label="有效期至">
          <el-date-picker v-model="form.validUntil" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
        <el-divider>同时录入缴费</el-divider>
        <el-form-item label="缴费金额(元)" required>
          <el-input-number v-model="form.amount" :min="0" :step="100" style="width: 100%" />
        </el-form-item>
        <el-form-item label="缴费方式">
          <el-select v-model="form.method" style="width: 100%">
            <el-option label="微信" value="wechat" />
            <el-option label="支付宝" value="alipay" />
            <el-option label="现金" value="cash" />
            <el-option label="刷卡" value="card" />
            <el-option label="其他" value="other" />
          </el-select>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.remark" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="formVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="onSave">确认报名</el-button>
      </template>
    </el-dialog>

    <!-- 调整课时 -->
    <el-dialog v-model="adjustVisible" title="调整剩余课时" width="400px">
      <p style="color: #909399; font-size: 13px">
        「{{ currentRow?.student?.name }} - {{ currentRow?.name }}」当前剩余 {{ currentRow?.remainingLessons }} 课时。
        正数为赠课/补偿,负数为扣减。
      </p>
      <el-input-number v-model="adjustDelta" :min="-100" :max="100" style="width: 100%" />
      <template #footer>
        <el-button @click="adjustVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="onAdjust">确认</el-button>
      </template>
    </el-dialog>

    <!-- 编辑 -->
    <el-dialog v-model="editVisible" title="编辑课时包" width="420px">
      <el-form :model="editForm" label-width="90px">
        <el-form-item label="名称">
          <el-input v-model="editForm.name" />
        </el-form-item>
        <el-form-item label="有效期至">
          <el-date-picker v-model="editForm.validUntil" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="editForm.status" style="width: 100%">
            <el-option label="生效中" value="active" />
            <el-option label="已用完" value="finished" />
            <el-option label="已过期" value="expired" />
            <el-option label="已退款" value="refunded" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="onEdit">保存</el-button>
      </template>
    </el-dialog>
  </el-card>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import {
  listPackages,
  createPackage,
  updatePackage,
  adjustPackage,
  deletePackage,
  listStudents,
  listCourses,
} from '../api';

const items = ref([]);
const total = ref(0);
const students = ref([]);
const courses = ref([]);
const loading = ref(false);
const saving = ref(false);
const onlyLow = ref(false);
const query = reactive({ studentId: null, status: '', page: 1, pageSize: 20 });

const formVisible = ref(false);
const form = reactive({
  studentId: null,
  courseId: null,
  name: '',
  totalLessons: 24,
  validUntil: '',
  amount: 0,
  method: 'wechat',
  remark: '',
});

const adjustVisible = ref(false);
const adjustDelta = ref(1);
const currentRow = ref(null);

const editVisible = ref(false);
const editForm = reactive({ id: null, name: '', validUntil: '', status: 'active' });

async function load() {
  loading.value = true;
  try {
    const res = await listPackages({
      studentId: query.studentId || undefined,
      status: query.status || undefined,
      lowRemaining: onlyLow.value ? 3 : undefined,
      page: query.page,
      pageSize: query.pageSize,
    });
    items.value = res.items;
    total.value = res.total;
  } finally {
    loading.value = false;
  }
}

function openForm() {
  Object.assign(form, { studentId: null, courseId: null, name: '', totalLessons: 24, validUntil: '', amount: 0, method: 'wechat', remark: '' });
  formVisible.value = true;
}

async function onSave() {
  if (!form.studentId || !form.name.trim()) {
    ElMessage.warning('请选择学员并填写课时包名称');
    return;
  }
  if (!form.courseId) {
    ElMessage.warning('请选择课种:课时按课种消耗,不再支持通用课时包');
    return;
  }
  saving.value = true;
  try {
    await createPackage({
      studentId: form.studentId,
      courseId: form.courseId,
      name: form.name,
      totalLessons: form.totalLessons,
      validUntil: form.validUntil || undefined,
      payment: { amount: form.amount, method: form.method, remark: form.remark || undefined },
    });
    ElMessage.success('报名成功,已生成缴费流水');
    formVisible.value = false;
    load();
  } finally {
    saving.value = false;
  }
}

function openAdjust(row) {
  currentRow.value = row;
  adjustDelta.value = 1;
  adjustVisible.value = true;
}

async function onAdjust() {
  saving.value = true;
  try {
    await adjustPackage(currentRow.value.id, adjustDelta.value);
    ElMessage.success('已调整');
    adjustVisible.value = false;
    load();
  } finally {
    saving.value = false;
  }
}

function openEdit(row) {
  Object.assign(editForm, { id: row.id, name: row.name, validUntil: row.validUntil || '', status: row.status });
  editVisible.value = true;
}

async function onEdit() {
  saving.value = true;
  try {
    await updatePackage(editForm.id, { name: editForm.name, validUntil: editForm.validUntil, status: editForm.status });
    ElMessage.success('已保存');
    editVisible.value = false;
    load();
  } finally {
    saving.value = false;
  }
}

async function onDelete(row) {
  await deletePackage(row.id);
  ElMessage.success('已删除');
  load();
}

onMounted(async () => {
  const [s, c] = await Promise.all([listStudents({ pageSize: 100 }), listCourses()]);
  students.value = s.items;
  courses.value = c;
  load();
});
</script>

<style scoped>
.toolbar {
  display: flex;
  gap: 8px;
  margin-bottom: 14px;
  align-items: center;
}
</style>
