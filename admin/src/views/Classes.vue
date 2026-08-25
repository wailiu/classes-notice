<template>
  <el-card shadow="never">
    <div class="toolbar">
      <el-select v-model="query.courseId" placeholder="按科目筛选" clearable style="width: 150px" @change="load">
        <el-option v-for="c in courses" :key="c.id" :label="c.name" :value="c.id" />
      </el-select>
      <el-select v-model="query.teacherId" placeholder="按老师筛选" clearable style="width: 150px" @change="load">
        <el-option v-for="t in teachers" :key="t.id" :label="t.name" :value="t.id" />
      </el-select>
      <el-button type="success" @click="openForm()">新增班级</el-button>
    </div>

    <el-table :data="items" v-loading="loading">
      <el-table-column label="ID" prop="id" width="60" />
      <el-table-column label="班级名称" prop="name" min-width="150" />
      <el-table-column label="科目" prop="course.name" width="100" />
      <el-table-column label="老师" prop="teacher.name" width="90" />
      <el-table-column label="上课时间" width="170">
        <template #default="{ row }">{{ weekdayText(row.weekday) }} {{ row.startTime }}-{{ row.endTime }}</template>
      </el-table-column>
      <el-table-column label="教室" prop="room" width="110" />
      <el-table-column label="容量" prop="capacity" width="70" />
      <el-table-column label="状态" width="80">
        <template #default="{ row }">
          <el-tag size="small" :type="row.status === 'active' ? 'success' : 'info'">
            {{ row.status === 'active' ? '开班中' : '停开' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="220" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openForm(row)">编辑</el-button>
          <el-button link type="warning" @click="openGenerate(row)">生成课次</el-button>
          <el-popconfirm title="确认删除该班级?" @confirm="onDelete(row)">
            <template #reference>
              <el-button link type="danger">删除</el-button>
            </template>
          </el-popconfirm>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="formVisible" :title="form.id ? '编辑班级' : '新增班级'" width="520px">
      <el-form :model="form" label-width="90px">
        <el-form-item label="班级名称" required>
          <el-input v-model="form.name" placeholder="如: 素描少儿A班" />
        </el-form-item>
        <el-form-item label="科目" required>
          <el-select v-model="form.courseId" style="width: 100%">
            <el-option v-for="c in courses" :key="c.id" :label="c.name" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="老师" required>
          <el-select v-model="form.teacherId" style="width: 100%">
            <el-option v-for="t in teachers" :key="t.id" :label="`${t.name}(${t.subjects || '-'})`" :value="t.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="教室" required>
          <el-input v-model="form.room" />
        </el-form-item>
        <el-form-item label="每周">
          <el-select v-model="form.weekday" style="width: 100%">
            <el-option v-for="(name, i) in weekdays" :key="i + 1" :label="name" :value="i + 1" />
          </el-select>
        </el-form-item>
        <el-form-item label="时间">
          <el-time-select v-model="form.startTime" start="08:00" end="21:00" step="00:15" placeholder="开始" style="width: 48%" />
          <span style="margin: 0 4px">-</span>
          <el-time-select v-model="form.endTime" start="08:30" end="22:00" step="00:15" placeholder="结束" style="width: 48%" />
        </el-form-item>
        <el-form-item label="容量">
          <el-input-number v-model="form.capacity" :min="1" :max="200" />
        </el-form-item>
        <el-form-item label="状态">
          <el-radio-group v-model="form.status">
            <el-radio value="active">开班中</el-radio>
            <el-radio value="inactive">停开</el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="formVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="onSave">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="generateVisible" title="按周排课生成课次" width="440px">
      <p style="color: #909399; font-size: 13px">
        为班级「{{ currentClass?.name }}」({{ weekdayText(currentClass?.weekday) }}
        {{ currentClass?.startTime }}-{{ currentClass?.endTime }})在日期范围内生成课次,已存在的日期自动跳过。
      </p>
      <el-date-picker
        v-model="generateRange"
        type="daterange"
        value-format="YYYY-MM-DD"
        start-placeholder="开始日期"
        end-placeholder="结束日期"
        style="width: 100%; box-sizing: border-box"
      />
      <template #footer>
        <el-button @click="generateVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="onGenerate">生成</el-button>
      </template>
    </el-dialog>
  </el-card>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import {
  listClasses,
  createClass,
  updateClass,
  deleteClass,
  generateLessons,
  listCourses,
  listTeachers,
} from '../api';

const weekdays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
const items = ref([]);
const courses = ref([]);
const teachers = ref([]);
const loading = ref(false);
const saving = ref(false);
const query = reactive({ courseId: null, teacherId: null });

const formVisible = ref(false);
const form = reactive({
  id: null,
  name: '',
  courseId: null,
  teacherId: null,
  room: '',
  weekday: 6,
  startTime: '10:00',
  endTime: '11:30',
  capacity: 10,
  status: 'active',
});

const generateVisible = ref(false);
const generateRange = ref([]);
const currentClass = ref(null);

function weekdayText(w) {
  return w ? weekdays[w - 1] : '';
}

async function load() {
  loading.value = true;
  try {
    items.value = await listClasses({
      courseId: query.courseId || undefined,
      teacherId: query.teacherId || undefined,
    });
  } finally {
    loading.value = false;
  }
}

function openForm(row) {
  Object.assign(form, row
    ? { id: row.id, name: row.name, courseId: row.courseId, teacherId: row.teacherId, room: row.room, weekday: row.weekday, startTime: row.startTime, endTime: row.endTime, capacity: row.capacity, status: row.status }
    : { id: null, name: '', courseId: null, teacherId: null, room: '', weekday: 6, startTime: '10:00', endTime: '11:30', capacity: 10, status: 'active' });
  formVisible.value = true;
}

async function onSave() {
  if (!form.name.trim() || !form.courseId || !form.teacherId || !form.room.trim()) {
    ElMessage.warning('请完整填写班级信息');
    return;
  }
  if (!form.startTime || !form.endTime || form.startTime >= form.endTime) {
    ElMessage.warning('请设置正确的上课时间');
    return;
  }
  saving.value = true;
  try {
    const data = { ...form };
    delete data.id;
    if (form.id) await updateClass(form.id, data);
    else await createClass(data);
    ElMessage.success('保存成功');
    formVisible.value = false;
    load();
  } finally {
    saving.value = false;
  }
}

async function onDelete(row) {
  await deleteClass(row.id);
  ElMessage.success('已删除');
  load();
}

function openGenerate(row) {
  currentClass.value = row;
  generateRange.value = [];
  generateVisible.value = true;
}

async function onGenerate() {
  if (!generateRange.value?.length) {
    ElMessage.warning('请选择日期范围');
    return;
  }
  saving.value = true;
  try {
    const res = await generateLessons(currentClass.value.id, {
      from: generateRange.value[0],
      to: generateRange.value[1],
    });
    ElMessage.success(`已生成 ${res.created} 节课次`);
    generateVisible.value = false;
  } finally {
    saving.value = false;
  }
}

onMounted(async () => {
  const [c, t] = await Promise.all([listCourses(), listTeachers({ pageSize: 100 })]);
  courses.value = c;
  teachers.value = t.items;
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
