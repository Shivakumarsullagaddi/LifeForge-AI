import { globalToolGateway } from '../lib/tools/gateway';
import { authoritativeState } from '../lib/state/applicationState';

async function runTests() {
  console.log('--- TESTING GOAL, TASK, CALENDAR & RESUME ENHANCEMENTS ---');
  const userId = 'test_mentor_user_' + Date.now();

  // Test 1: create_goal and get_goals
  const createGoalRes = await globalToolGateway.executeTool(userId, {
    requestId: 'req_cg_1',
    agentTaskId: 'task_cg_1',
    conversationId: 'default',
    turnId: 'default',
    tool: 'create_goal',
    arguments: { title: 'Master System Design & Algorithms' },
  });
  if (!createGoalRes.success) throw new Error('create_goal failed');
  console.log('✓ Test 1 Passed: Goal created successfully.');

  const getGoalsRes = await globalToolGateway.executeTool(userId, {
    requestId: 'req_gg_1',
    agentTaskId: 'task_gg_1',
    conversationId: 'default',
    turnId: 'default',
    tool: 'get_goals',
    arguments: {},
  });
  const goals = (getGoalsRes.data as any)?.goals;
  if (!getGoalsRes.success || !goals || goals.length < 1) {
    throw new Error('get_goals failed to return goals');
  }
  console.log(`✓ Test 2 Passed: get_goals retrieved ${goals.length} goals.`);

  // Test 2: update_goal
  const goalId = (createGoalRes.data as any)?.goalId;
  const updateGoalRes = await globalToolGateway.executeTool(userId, {
    requestId: 'req_ug_1',
    agentTaskId: 'task_ug_1',
    conversationId: 'default',
    turnId: 'default',
    tool: 'update_goal',
    arguments: {
      goalId,
      newTitle: 'Master System Design & Large Scale Microservices',
      progress: 50,
      status: 'in_progress',
    },
  });
  if (!updateGoalRes.success || (updateGoalRes.data as any)?.title !== 'Master System Design & Large Scale Microservices') {
    throw new Error('update_goal failed to edit goal');
  }
  console.log('✓ Test 3 Passed: update_goal edited goal successfully.');

  // Test 3: create_task, get_tasks, and update_task
  const createTaskRes = await globalToolGateway.executeTool(userId, {
    requestId: 'req_ct_1',
    agentTaskId: 'task_ct_1',
    conversationId: 'default',
    turnId: 'default',
    tool: 'create_task',
    arguments: { title: 'Solve LeetCode Graph Problems' },
  });
  if (!createTaskRes.success) throw new Error('create_task failed');
  console.log('✓ Test 4 Passed: Task created successfully.');

  const getTasksRes = await globalToolGateway.executeTool(userId, {
    requestId: 'req_gt_1',
    agentTaskId: 'task_gt_1',
    conversationId: 'default',
    turnId: 'default',
    tool: 'get_tasks',
    arguments: {},
  });
  const tasks = (getTasksRes.data as any)?.tasks;
  if (!getTasksRes.success || !tasks || tasks.length < 1) {
    throw new Error('get_tasks failed to return tasks');
  }
  console.log(`✓ Test 5 Passed: get_tasks retrieved ${tasks.length} tasks.`);

  const taskId = (createTaskRes.data as any)?.taskId;
  const updateTaskRes = await globalToolGateway.executeTool(userId, {
    requestId: 'req_ut_1',
    agentTaskId: 'task_ut_1',
    conversationId: 'default',
    turnId: 'default',
    tool: 'update_task',
    arguments: {
      taskId,
      newTitle: 'Solve 5 Hard Graph & Dynamic Programming Problems',
      status: 'completed',
    },
  });
  if (!updateTaskRes.success || (updateTaskRes.data as any)?.status !== 'completed') {
    throw new Error('update_task failed to edit task');
  }
  console.log('✓ Test 6 Passed: update_task edited task successfully.');

  // Test 4: create_calendar_event
  const createCalRes = await globalToolGateway.executeTool(userId, {
    requestId: 'req_cce_1',
    agentTaskId: 'task_cce_1',
    conversationId: 'default',
    turnId: 'default',
    tool: 'create_calendar_event',
    arguments: {
      summary: 'Mock Interview Session',
      durationMinutes: 45,
    },
  }, {
    userData: {
      calendarState: 'CONNECTED',
      calendarToken: 'mock_google_calendar_test_token',
    },
  });
  if (!createCalRes.success || !(createCalRes.data as any)?.event) {
    throw new Error('create_calendar_event failed');
  }
  console.log('✓ Test 7 Passed: create_calendar_event scheduled event successfully.');

  // Test 5: request_resume_upload
  const resumeUploadRes = await globalToolGateway.executeTool(userId, {
    requestId: 'req_rru_1',
    agentTaskId: 'task_rru_1',
    conversationId: 'default',
    turnId: 'default',
    tool: 'request_resume_upload',
    arguments: { reason: 'User requested resume upload' },
  });
  if (!resumeUploadRes.success || (resumeUploadRes.data as any)?.actionRequired !== 'UPLOAD_RESUME') {
    throw new Error('request_resume_upload failed');
  }
  console.log('✓ Test 8 Passed: request_resume_upload prompted correctly.');

  console.log('--- ALL 8 ENHANCEMENT TESTS PASSED ---');
}

runTests().catch((e) => {
  console.error('Test execution failed:', e);
  process.exit(1);
});
