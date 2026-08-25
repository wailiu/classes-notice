<template>
  <el-card shadow="never">
    <div class="toolbar">
      <el-date-picker
        v-model="range"
        type="daterange"
        value-format="YYYY-MM-DD"
        start-placeholder="开始日期"
        end-placeholder="结束日期"
        style="width: 260px"
        @change="load"
      />
      <el-select v-model="query.classId" placeholder="按班级筛选" clearable style="width: 180px" @change="load">
        <el-option v-for="c in classes" :key="c.id" :label="c.name" :value="c.id" />
      </el-select>
      <el-select v-model="query.status" placeholder="状态" clearable style="width: 120px" @change="load">
        <el-option label="待上课" value="scheduled" />
        <el-option label="已取消" value="cancelled" />
      </el-select>
      <el-button type="primary" @click="load">查询</el-button>
    </div>

    <el-table :data="items" v-loading="loading">
      <el-table-column label="日期" prop="date" width="110" sortable />
      <el-table-column label="时间" width="120">
        <template #default="{ row }">{{ row.startTime }}-{{ row.endTime }}</template>
      </el-table-column>
      <el-table-column label="班级" prop="classEntity.name" min-width="140" />
      <el-table-column label="科目" prop="classEntity.course.name" width="90" />
      <el-table-column label="老师" prop="classEntity.teacher.name" width="80" />
      <el-table-column label="教室" prop="classEntity.room" width="100" />
      <el-table-column label="预约/容量" width="100">
        <template #default="{ row }">
          <el-tag size="small" :type="(row.bookedCount ?? 0) >= row.classEntity.capacity ? 'danger' : 'primary'">
            {{ row.bookedCount ?? 0 }}/{{ row.classEntity.capacity }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="90">
        <template #default="{ row }">
          <el-tag size="small" :type="{ scheduled: 'success', cancelled: 'info', finished: 'warning' }[row.status]">
            {{ { scheduled: '待上课', cancelled: '已取消', finished: '已结课' }[row.status] }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="220" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openRoster(row)">预约名单</el-button>
          <el-button link type="success" :disabled="row.status !== 'scheduled'" @click="openBook(row)">代预约</el-button>
          <el-popconfirm title="取消课次将退回所有已扣课时,确认?" @confirm="onCancelLesson(row)">
            <template #reference>
              <el-button link type="danger" :disabled="row.status !== 'scheduled'">取消课次</el-button>
            </template>
          </el-popconfirm>
        </template>
      </el-table-column>
    </el-table>

    <!-- 预约名单抽屉 -->
    <el-drawer v-model="rosterVisible" size="640px">
      <template #header>
        <b>预约名单</b>
        <span v-if="currentLesson" style="margin-left: 10px; color: #909399; font-size: 13px">
          {{ currentLesson.date }} {{ currentLesson.startTime }}-{{ currentLesson.endTime }}
          {{ currentLesson.classEntity?.name }}
        </span>
      </template>
      <el-table :data="roster" size="small" v-loading="rosterLoading" empty-text="暂无预约">
        <el-table-column label="学员" prop="student.name" width="90" />
        <el-table-column label="课时包">
          <template #default="{ row }">{{ row.coursePackage?.name || '-' }}</template>
        </el-table-column>
        <el-table-column label="来源" width="80">
          <template #default="{ row }">{{ row.source === 'parent' ? '家长' : '后台' }}</template>
        </el-table-column>
        <el-table-column label="状态" width="85">
          <template #default="{ row }">
            <el-tag size="small" :type="{ booked: 'primary', checked_in: 'success', cancelled: 'info', no_show: 'danger' }[row.status]">
              {{ { booked: '已预约', checked_in: '已签到', cancelled: '已取消', no_show: '缺勤' }[row.status] }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="190">
          <template #default="{ row }">
            <el-button link type="success" :disabled="row.status !== 'booked'" @click="onCheckin(row)">签到</el-button>
            <el-button link type="warning" :disabled="row.status !== 'booked'" @click="onNoShow(row)">缺勤</el-button>
            <el-popconfirm title="取消预约将退回课时,确认?" @confirm="onCancelBooking(row)">
              <template #reference>
                <el-button link type="danger" :disabled="row.status !== 'booked'">取消</el-button>
              </template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>
    </el-drawer>

    <!-- 代预约 -->
    <el-dialog v-model="bookVisible" title="后台代预约" width="440px">
      <p style="color: #909399; font-size: 13px">
        {{ currentLesson?.date }} {{ currentLesson?.startTime }}-{{ currentLesson?.endTime }}
        {{ currentLesson?.classEntity?.name }}
      </p>
      <el-select v-model="bookStudentId" filterable placeholder="选择学员" style="width: 100%">
        <el-option v-for="s in students" :key="s.id" :label="s.name" :value="s.id" />
      </el-select>
      <p style="color: #909399; font-size: 12px">将自动从该学员可用课时包中扣减 1 课时(优先科目专属包)。</p>
      <template #footer>
        <el-button @click="bookVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="onBook">确认预约</el-button>
      </template>
    </el-dialog>
  </el-card>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue';
import dayjs from 'dayjs';
import { ElMessage } from 'element-plus';
import {
  listLessons,
  listClasses,
  cancelLesson,
  listBookings,
  createBooking,
  cancelBooking,
  checkinBooking,
  noShowBooking,
  listStudents,
} from '../api';

const items = ref([]);
const classes = ref([]);
const students = ref([]);
const loading = ref(false);
const saving = ref(false);
const range = ref([dayjs().format('YYYY-MM-DD'), dayjs().add(14, 'day').format('YYYY-MM-DD')]);
const query = reactive({ classId: null, status: '' });

const rosterVisible = ref(false);
const rosterLoading = ref(false);
const roster = ref([]);
const currentLesson = ref(null);

const bookVisible = ref(false);
const bookStudentId = ref(null);

async function load() {
  loading.value = true;
  try {
    items.value = await listLessons({
      from: range.value?.[0],
      to: range.value?.[1],
      classId: query.classId || undefined,
      status: query.status || undefined,
    });
  } finally {
    loading.value = false;
  }
}

async function openRoster(row) {
  currentLesson.value = row;
  rosterVisible.value = true;
  await loadRoster();
}

async function loadRoster() {
  rosterLoading.value = true;
  try {
    const res = await listBookings({ lessonId: currentLesson.value.id, pageSize: 200 });
    roster.value = res.items;
  } finally {
    rosterLoading.value = false;
  }
}

function openBook(row) {
  currentLesson.value = row;
  bookStudentId.value = null;
  bookVisible.value = true;
}

async function onBook() {
  if (!bookStudentId.value) {
    ElMessage.warning('请选择学员');
    return;
  }
  saving.value = true;
  try {
    await createBooking({ studentId: bookStudentId.value, lessonId: currentLesson.value.id });
    ElMessage.success('预约成功,已扣 1 课时');
    bookVisible.value = false;
    load();
  } finally {
    saving.value = false;
  }
}

async function onCancelLesson(row) {
  await cancelLesson(row.id);
  ElMessage.success('课次已取消,课时已退回');
  load();
}

async function onCheckin(row) {
  await checkinBooking(row.id);
  ElMessage.success('已签到');
  loadRoster();
  load();
}

async function onNoShow(row) {
  await noShowBooking(row.id);
  ElMessage.success('已标记缺勤(不退课时)');
  loadRoster();
}

async function onCancelBooking(row) {
  await cancelBooking(row.id);
  ElMessage.success('已取消,课时退回');
  loadRoster();
  load();
}

onMounted(async () => {
  const [c, s] = await Promise.all([listClasses({}), listStudents({ pageSize: 100, status: 'active' })]);
  classes.value = c;
  students.value = s.items;
  load();
});
</script>

<style scoped>
.toolbar {
  display: flex;
  gap: 8px;
  margin-bottom: 14px;
}
</style>
