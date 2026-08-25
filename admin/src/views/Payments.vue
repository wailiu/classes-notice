<template>
  <el-card shadow="never">
    <div class="toolbar">
      <el-select v-model="query.studentId" filterable clearable placeholder="按学员筛选" style="width: 160px" @change="load">
        <el-option v-for="s in students" :key="s.id" :label="s.name" :value="s.id" />
      </el-select>
      <el-select v-model="query.method" clearable placeholder="缴费方式" style="width: 130px" @change="load">
        <el-option label="微信" value="wechat" />
        <el-option label="支付宝" value="alipay" />
        <el-option label="现金" value="cash" />
        <el-option label="刷卡" value="card" />
        <el-option label="其他" value="other" />
      </el-select>
      <el-date-picker
        v-model="range"
        type="daterange"
        value-format="YYYY-MM-DD"
        start-placeholder="开始"
        end-placeholder="结束"
        style="width: 240px"
        @change="load"
      />
      <el-button type="primary" @click="load">查询</el-button>
      <el-button type="success" @click="openForm()">补录缴费</el-button>
      <span class="sum">本页合计:¥{{ sumAmount.toFixed(2) }}</span>
    </div>

    <el-table :data="items" v-loading="loading">
      <el-table-column label="流水号" prop="serialNo" width="200" />
      <el-table-column label="学员" prop="student.name" width="100" />
      <el-table-column label="金额(元)" width="110">
        <template #default="{ row }">¥{{ Number(row.amount).toFixed(2) }}</template>
      </el-table-column>
      <el-table-column label="方式" width="90">
        <template #default="{ row }">
          {{ { wechat: '微信', alipay: '支付宝', cash: '现金', card: '刷卡', other: '其他' }[row.method] }}
        </template>
      </el-table-column>
      <el-table-column label="课时包">
        <template #default="{ row }">{{ row.coursePackage?.name || '-' }}</template>
      </el-table-column>
      <el-table-column label="缴费时间" width="170">
        <template #default="{ row }">{{ formatTime(row.paidAt) }}</template>
      </el-table-column>
      <el-table-column label="状态" width="90">
        <template #default="{ row }">
          <el-tag size="small" :type="row.status === 'paid' ? 'success' : 'danger'">
            {{ row.status === 'paid' ? '已缴费' : '已退费' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="备注" prop="remark" show-overflow-tooltip />
      <el-table-column label="操作" width="90" fixed="right">
        <template #default="{ row }">
          <el-popconfirm title="退费将同时作废关联课时包,确认?" @confirm="onRefund(row)">
            <template #reference>
              <el-button link type="danger" :disabled="row.status === 'refunded'">退费</el-button>
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

    <el-dialog v-model="formVisible" title="补录缴费" width="440px">
      <el-form :model="form" label-width="100px">
        <el-form-item label="学员" required>
          <el-select v-model="form.studentId" filterable style="width: 100%">
            <el-option v-for="s in students" :key="s.id" :label="s.name" :value="s.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="金额(元)" required>
          <el-input-number v-model="form.amount" :min="0" :step="100" style="width: 100%" />
        </el-form-item>
        <el-form-item label="方式">
          <el-select v-model="form.method" style="width: 100%">
            <el-option label="微信" value="wechat" />
            <el-option label="支付宝" value="alipay" />
            <el-option label="现金" value="cash" />
            <el-option label="刷卡" value="card" />
            <el-option label="其他" value="other" />
          </el-select>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.remark" placeholder="如: 教材费 / 演出服费用" />
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
import dayjs from 'dayjs';
import { ElMessage } from 'element-plus';
import { listPayments, createPayment, refundPayment, listStudents } from '../api';

const items = ref([]);
const total = ref(0);
const sumAmount = ref(0);
const students = ref([]);
const loading = ref(false);
const saving = ref(false);
const range = ref([]);
const query = reactive({ studentId: null, method: '', page: 1, pageSize: 20 });
const formVisible = ref(false);
const form = reactive({ studentId: null, amount: 0, method: 'wechat', remark: '' });

function formatTime(t) {
  return t ? dayjs(t).format('YYYY-MM-DD HH:mm') : '-';
}

async function load() {
  loading.value = true;
  try {
    const res = await listPayments({
      studentId: query.studentId || undefined,
      method: query.method || undefined,
      from: range.value?.[0],
      to: range.value?.[1],
      page: query.page,
      pageSize: query.pageSize,
    });
    items.value = res.items;
    total.value = res.total;
    sumAmount.value = res.sumAmount ?? 0;
  } finally {
    loading.value = false;
  }
}

function openForm() {
  Object.assign(form, { studentId: null, amount: 0, method: 'wechat', remark: '' });
  formVisible.value = true;
}

async function onSave() {
  if (!form.studentId || form.amount <= 0) {
    ElMessage.warning('请选择学员并填写金额');
    return;
  }
  saving.value = true;
  try {
    await createPayment({ studentId: form.studentId, amount: form.amount, method: form.method, remark: form.remark || undefined });
    ElMessage.success('已保存');
    formVisible.value = false;
    load();
  } finally {
    saving.value = false;
  }
}

async function onRefund(row) {
  await refundPayment(row.id);
  ElMessage.success('已退费');
  load();
}

onMounted(async () => {
  const s = await listStudents({ pageSize: 100 });
  students.value = s.items;
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
.sum {
  margin-left: auto;
  font-weight: 600;
  color: #f56c6c;
}
</style>
