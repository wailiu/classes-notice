<template>
  <div>
    <el-row :gutter="16">
      <el-col :span="6" v-for="card in cards" :key="card.label">
        <el-card shadow="hover">
          <div class="stat">
            <div class="num" :style="{ color: card.color }">{{ card.value }}</div>
            <div class="label">{{ card.label }}</div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="16" style="margin-top: 16px">
      <el-col :span="14">
        <el-card shadow="never">
          <template #header>
            <b>今日待上课</b>
            <el-tag size="small" style="margin-left: 8px">{{ todayLessons.length }} 节</el-tag>
          </template>
          <el-table :data="todayLessons" size="small" empty-text="今天没有排课">
            <el-table-column label="时间" width="130">
              <template #default="{ row }">{{ row.startTime }} - {{ row.endTime }}</template>
            </el-table-column>
            <el-table-column label="班级" prop="classEntity.name" />
            <el-table-column label="科目" width="90" prop="classEntity.course.name" />
            <el-table-column label="老师" width="80" prop="classEntity.teacher.name" />
            <el-table-column label="教室" width="100" prop="classEntity.room" />
            <el-table-column label="预约" width="80">
              <template #default="{ row }">{{ row.bookedCount ?? 0 }}/{{ row.classEntity.capacity }}</template>
            </el-table-column>
            <el-table-column label="状态" width="80">
              <template #default="{ row }">
                <el-tag size="small" :type="row.status === 'scheduled' ? 'success' : 'info'">
                  {{ statusText(row.status) }}
                </el-tag>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
      <el-col :span="10">
        <el-card shadow="never">
          <template #header>
            <b>剩余课时预警</b>
            <el-tag size="small" type="warning" style="margin-left: 8px">≤ 3 课时</el-tag>
          </template>
          <el-table :data="lowHours" size="small" empty-text="暂无预警">
            <el-table-column label="学员" prop="student.name" width="90" />
            <el-table-column label="课时包" prop="name" />
            <el-table-column label="剩余" width="70">
              <template #default="{ row }">
                <el-tag size="small" type="danger">{{ row.remainingLessons }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="有效期至" prop="validUntil" width="110" />
          </el-table>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { getSummary, getTodayLessons, getLowHours } from '../api';

const summary = ref({});
const todayLessons = ref([]);
const lowHours = ref([]);

const cards = computed(() => [
  { label: '在读学员', value: summary.value.activeStudents ?? '-', color: '#409eff' },
  { label: '今日课次', value: summary.value.todayLessons ?? '-', color: '#67c23a' },
  { label: '生效课时包', value: summary.value.activePackages ?? '-', color: '#e6a23c' },
  { label: '本月收入(元)', value: summary.value.monthIncome ?? '-', color: '#f56c6c' },
]);

function statusText(status) {
  return { scheduled: '待上课', finished: '已结课', cancelled: '已取消' }[status] || status;
}

onMounted(async () => {
  const [s, t, l] = await Promise.all([getSummary(), getTodayLessons(), getLowHours()]);
  summary.value = s;
  todayLessons.value = t;
  lowHours.value = l;
});
</script>

<style scoped>
.stat {
  text-align: center;
}
.num {
  font-size: 28px;
  font-weight: 700;
}
.label {
  color: #909399;
  margin-top: 4px;
}
</style>
