import fs from 'fs';
import path from 'path';

export interface TestStoreData {
  goals: Record<string, any[]>;
  tasks: Record<string, any[]>;
  reflections: Record<string, any[]>;
  actionConfirmations: Record<string, any[]>;
  placementProfiles?: Record<string, any>;
  resumes?: Record<string, any>;
  conversations?: Record<string, any[]>;
  messages?: Record<string, any[]>;
  calendarEvents?: Record<string, any[]>;
}

const memoryStore: TestStoreData = {
  goals: {},
  tasks: {},
  reflections: {},
  actionConfirmations: {},
  placementProfiles: {},
  resumes: {},
  conversations: {},
  messages: {},
  calendarEvents: {},
};

function readStore(): TestStoreData {
  return memoryStore;
}

function writeStore(data: TestStoreData): void {
  Object.assign(memoryStore, data);
}

export const testStore = {
  getGoals(userId: string): any[] {
    const store = readStore();
    return store.goals[userId] || [];
  },

  addGoal(userId: string, goal: any): string {
    const store = readStore();
    const id = `goal_test_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const newGoal = { id, userId, createdAt: new Date().toISOString(), progress: 0, status: 'in_progress', ...goal };
    if (!store.goals[userId]) store.goals[userId] = [];
    store.goals[userId].unshift(newGoal);
    writeStore(store);
    return id;
  },

  updateGoal(userId: string, goalId: string, updates: any): void {
    const store = readStore();
    const list = store.goals[userId] || [];
    const idx = list.findIndex((g) => g.id === goalId);
    if (idx !== -1) {
      list[idx] = { ...list[idx], ...updates, updatedAt: new Date().toISOString() };
      writeStore(store);
    }
  },

  deleteGoal(userId: string, goalId: string): void {
    const store = readStore();
    if (store.goals[userId]) {
      store.goals[userId] = store.goals[userId].filter((g) => g.id !== goalId);
      writeStore(store);
    }
  },

  getTasks(userId: string): any[] {
    const store = readStore();
    return store.tasks[userId] || [];
  },

  addTask(userId: string, task: any): string {
    const store = readStore();
    const id = `task_test_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const newTask = { id, userId, createdAt: new Date().toISOString(), status: 'pending', ...task };
    if (!store.tasks[userId]) store.tasks[userId] = [];
    store.tasks[userId].unshift(newTask);
    writeStore(store);
    return id;
  },

  updateTask(userId: string, taskId: string, updates: any): void {
    const store = readStore();
    const list = store.tasks[userId] || [];
    const idx = list.findIndex((t) => t.id === taskId);
    if (idx !== -1) {
      list[idx] = { ...list[idx], ...updates, updatedAt: new Date().toISOString() };
      writeStore(store);
    }
  },

  deleteTask(userId: string, taskId: string): void {
    const store = readStore();
    if (store.tasks[userId]) {
      store.tasks[userId] = store.tasks[userId].filter((t) => t.id !== taskId);
      writeStore(store);
    }
  },

  getReflections(userId: string): any[] {
    const store = readStore();
    return store.reflections[userId] || [];
  },

  addReflection(userId: string, reflection: any): string {
    const store = readStore();
    const id = `refl_test_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const newRefl = { id, userId, createdAt: new Date().toISOString(), ...reflection };
    if (!store.reflections[userId]) store.reflections[userId] = [];
    store.reflections[userId].unshift(newRefl);
    writeStore(store);
    return id;
  },

  getActionConfirmations(userId: string): any[] {
    const store = readStore();
    return store.actionConfirmations[userId] || [];
  },

  addActionConfirmation(userId: string, conf: any): string {
    const store = readStore();
    const id = `conf_test_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const newConf = { id, userId, requestedAt: new Date().toISOString(), status: 'pending', ...conf };
    if (!store.actionConfirmations[userId]) store.actionConfirmations[userId] = [];
    store.actionConfirmations[userId].unshift(newConf);
    writeStore(store);
    return id;
  },

  resolveActionConfirmation(userId: string, confId: string, status: string): void {
    const store = readStore();
    const list = store.actionConfirmations[userId] || [];
    const idx = list.findIndex((c) => c.id === confId);
    if (idx !== -1) {
      list[idx] = { ...list[idx], status, resolvedAt: new Date().toISOString() };
      writeStore(store);
    }
  },

  getPlacementProfile(userId: string): any | null {
    const store = readStore();
    return store.placementProfiles?.[userId] || null;
  },

  savePlacementProfile(userId: string, data: any): void {
    const store = readStore();
    if (!store.placementProfiles) store.placementProfiles = {};
    store.placementProfiles[userId] = {
      ...(store.placementProfiles[userId] || {}),
      ...data,
      userId,
      updatedAt: new Date().toISOString(),
    };
    writeStore(store);
  },

  getResumeMetadata(userId: string): any | null {
    const store = readStore();
    return store.resumes?.[userId] || null;
  },

  saveResumeMetadata(userId: string, data: any): void {
    const store = readStore();
    if (!store.resumes) store.resumes = {};
    store.resumes[userId] = {
      ...(store.resumes[userId] || {}),
      ...data,
      userId,
      updatedAt: new Date().toISOString(),
    };
    writeStore(store);
  },

  getConversations(userId: string): any[] {
    const store = readStore();
    return store.conversations?.[userId] || [];
  },

  createConversation(userId: string, data: any): string {
    const store = readStore();
    if (!store.conversations) store.conversations = {};
    if (!store.conversations[userId]) store.conversations[userId] = [];
    const id = data.id || `conv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const newConv = { ...data, id, conversationId: id, userId };
    const existingIdx = store.conversations[userId].findIndex((c: any) => c.id === id);
    if (existingIdx !== -1) {
      store.conversations[userId][existingIdx] = { ...store.conversations[userId][existingIdx], ...newConv };
    } else {
      store.conversations[userId].unshift(newConv);
    }
    writeStore(store);
    return id;
  },

  updateConversation(userId: string, conversationId: string, updates: any): void {
    const store = readStore();
    if (!store.conversations?.[userId]) return;
    const idx = store.conversations[userId].findIndex((c: any) => c.id === conversationId);
    if (idx !== -1) {
      store.conversations[userId][idx] = { ...store.conversations[userId][idx], ...updates, updatedAt: new Date().toISOString() };
      writeStore(store);
    }
  },

  getConversationMessages(userId: string, conversationId: string): any[] {
    const store = readStore();
    return store.messages?.[conversationId] || [];
  },

  addConversationMessage(userId: string, conversationId: string, message: any): string {
    const store = readStore();
    if (!store.messages) store.messages = {};
    if (!store.messages[conversationId]) store.messages[conversationId] = [];
    const id = message.id || `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const newMsg = { ...message, id, messageId: id, conversationId };
    store.messages[conversationId].push(newMsg);
    if (!store.conversations) store.conversations = {};
    if (!store.conversations[userId]) store.conversations[userId] = [];
    let conv = store.conversations[userId].find((c: any) => c.id === conversationId);
    if (!conv) {
      conv = {
        id: conversationId,
        conversationId,
        userId,
        title: 'Coaching Session',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        agentDomain: message.agentDomain || message.agent || 'orchestrator',
      };
      store.conversations[userId].unshift(conv);
    }
    conv.messageCount = store.messages[conversationId].length;
    conv.lastMessageAt = new Date().toISOString();
    conv.updatedAt = new Date().toISOString();
    conv.lastMessagePreview = (message.text || message.content || '').slice(0, 80);
    writeStore(store);
    return id;
  },

  getCalendarEvents(userId: string): any[] {
    const store = readStore();
    return store.calendarEvents?.[userId] || [];
  },

  addCalendarEvent(userId: string, event: any): string {
    const store = readStore();
    if (!store.calendarEvents) store.calendarEvents = {};
    if (!store.calendarEvents[userId]) store.calendarEvents[userId] = [];
    const id = event.id || event.eventId || `cal_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const newEvent = { ...event, id, eventId: id };
    store.calendarEvents[userId].push(newEvent);
    writeStore(store);
    return id;
  },

  deleteCalendarEvent(userId: string, eventId: string): void {
    const store = readStore();
    if (!store.calendarEvents?.[userId]) return;
    store.calendarEvents[userId] = store.calendarEvents[userId].filter((e: any) => e.id !== eventId && e.eventId !== eventId);
    writeStore(store);
  },

  clearTestUser(userId: string): void {
    const store = readStore();
    delete store.goals[userId];
    delete store.tasks[userId];
    delete store.reflections[userId];
    delete store.actionConfirmations[userId];
    if (store.placementProfiles) delete store.placementProfiles[userId];
    if (store.resumes) delete store.resumes[userId];
    if (store.calendarEvents) delete store.calendarEvents[userId];
    if (store.conversations && store.conversations[userId]) {
      for (const conv of store.conversations[userId]) {
        if (store.messages && store.messages[conv.id]) {
          delete store.messages[conv.id];
        }
      }
      delete store.conversations[userId];
    }
    writeStore(store);
  },

  clearConversations(userId: string): void {
    const store = readStore();
    if (store.conversations && store.conversations[userId]) {
      for (const conv of store.conversations[userId]) {
        if (store.messages && store.messages[conv.id]) {
          delete store.messages[conv.id];
        }
      }
      delete store.conversations[userId];
    }
    writeStore(store);
  },

  clearGoalsAndTasks(userId: string): void {
    const store = readStore();
    delete store.goals[userId];
    delete store.tasks[userId];
    writeStore(store);
  },

  clearReflections(userId: string): void {
    const store = readStore();
    delete store.reflections[userId];
    writeStore(store);
  },

  clearResume(userId: string): void {
    const store = readStore();
    if (store.placementProfiles) delete store.placementProfiles[userId];
    if (store.resumes) delete store.resumes[userId];
    writeStore(store);
  },

  clearUser(userId: string): void {
    this.clearTestUser(userId);
  },
};
