'use client';

import React, { useState, useEffect, useRef } from 'react';
import JSZip from 'jszip';
import {
  Code,
  Globe,
  Layers,
  Send,
  Sparkles,
  Settings,
  Github,
  Zap,
  Flame,
  Plus,
  Trash2,
  ExternalLink,
  ChevronRight,
  ChevronDown,
  CheckCircle2,
  CheckCircle,
  AlertTriangle,
  AlertCircle,
  Download,
  Terminal,
  Cpu,
  RefreshCw,
  Edit3,
  Check,
  Smartphone,
  Monitor,
  Tablet,
  X,
  FileCode,
  Database,
  Brain,
  ShieldCheck,
  Palette,
  Inbox,
  MousePointerClick,
  Users,
  GitPullRequest,
  ClipboardList,
} from 'lucide-react';

interface BrandProfile {
  project_id: string;
  primary_color: string;
  secondary_color?: string | null;
  accent_color?: string | null;
  font_family?: string | null;
  tone?: string | null;
  logo_description?: string | null;
  additional_notes?: string | null;
  updated_at: string;
}

interface FormSubmission {
  id: string;
  project_id: string;
  form_name: string;
  submitted_data: Record<string, any>;
  submitted_at: string;
}

interface TaskPlanItem {
  id: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
  result_summary?: string;
  retry_count: number;
}

interface TaskPlan {
  id: string;
  project_id: string;
  user_id: string;
  original_prompt: string;
  tasks: TaskPlanItem[];
  overall_status: 'pending' | 'in_progress' | 'completed' | 'failed';
  created_at: string;
  updated_at: string;
}

interface Project {
  id: string;
  name: string;
  description: string;
  files: Record<string, string>;
  live_url?: string;
  updated_at: string;
}

interface StepDetail {
  step: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  detail?: string;
}

interface Message {
  id: string;
  project_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  reasoning?: string;
  action_taken?: string;
  step_details?: StepDetail[];
  created_at: string;
}

interface UserSettings {
  github_token: string;
  github_owner: string;
  github_repo: string;
  vercel_token: string;
  vercel_team_id: string;
  vercel_project_id: string;
  firebase_db_url: string;
  firebase_secret: string;
  anthropic_api_key?: string;
  preferred_model?: string;
}

interface Lesson {
  id: string;
  project_id?: string | null;
  user_id: string;
  lesson_type: 'validation_error' | 'user_correction' | 'style_preference' | 'deployment_failure' | 'repeated_failure';
  trigger_summary: string;
  fix_or_rule: string;
  occurrence_count: number;
  created_at: string;
  updated_at: string;
}

export default function WebsiteBuilderApp() {
  // State
  const [uid, setUid] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('uid') || 'anon_user_default';
    }
    return 'anon_user_default';
  });
  const [customUidInput, setCustomUidInput] = useState<string>('');
  const [showUidModal, setShowUidModal] = useState<boolean>(false);

  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string>('');
  const [activeProject, setActiveProject] = useState<Project | null>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [promptInput, setPromptInput] = useState<string>('');
  const [isAgentRunning, setIsAgentRunning] = useState<boolean>(false);
  const [autoDeploy, setAutoDeploy] = useState<boolean>(false);

  // Settings
  const [settings, setSettings] = useState<UserSettings>({
    github_token: '',
    github_owner: '',
    github_repo: '',
    vercel_token: '',
    vercel_team_id: '',
    vercel_project_id: '',
    firebase_db_url: '',
    firebase_secret: '',
    anthropic_api_key: '',
    preferred_model: 'gemini',
  });
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);
  const [testingConnection, setTestingConnection] = useState<string>(''); // 'github' | 'vercel' | 'firebase'
  const [testResults, setTestResults] = useState<Record<string, { connected: boolean; message: string }>>({});

  // Right Panel State
  const [activeTab, setActiveTab] = useState<'preview' | 'code' | 'deployments' | 'rag' | 'lessons' | 'brand' | 'submissions' | 'spec' | 'team' | 'prs'>('preview');
  const [selectedFile, setSelectedFile] = useState<string>('index.html');
  const [editedFileContent, setEditedFileContent] = useState<string>('');
  const [previewViewport, setPreviewViewport] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [vectorMemories, setVectorMemories] = useState<any[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);

  // Brand System State
  const [brandProfile, setBrandProfile] = useState<BrandProfile | null>(null);
  const [brandForm, setBrandForm] = useState({
    primary_color: '#3b82f6',
    secondary_color: '#1e293b',
    accent_color: '#f59e0b',
    font_family: 'Inter, sans-serif',
    tone: 'professional',
    logo_description: '',
    additional_notes: '',
  });
  const [isSavingBrand, setIsSavingBrand] = useState<boolean>(false);

  // Task Plan & Form Submissions State
  const [activeTaskPlan, setActiveTaskPlan] = useState<TaskPlan | null>(null);
  const [formSubmissions, setFormSubmissions] = useState<FormSubmission[]>([]);

  // Spec / Requirement management state
  const [activeSpec, setActiveSpec] = useState<any>(null);
  const [specRequirementDraft, setSpecRequirementDraft] = useState('');
  const [isGeneratingSpec, setIsGeneratingSpec] = useState(false);

  // Team collaboration state
  const [projectMembers, setProjectMembers] = useState<any[]>([]);
  const [myProjectRole, setMyProjectRole] = useState<string | null>(null);
  const [inviteUidDraft, setInviteUidDraft] = useState('');
  const [inviteRoleDraft, setInviteRoleDraft] = useState<'editor' | 'viewer'>('editor');
  const [isInvitingMember, setIsInvitingMember] = useState(false);

  // Pull request automation state
  const [pullRequests, setPullRequests] = useState<any[]>([]);
  const [isLoadingSubmissions, setIsLoadingSubmissions] = useState<boolean>(false);

  // Visual Click-to-Edit State
  const [isEditModeActive, setIsEditModeActive] = useState<boolean>(false);
  const [showElementEditModal, setShowElementEditModal] = useState<boolean>(false);
  const [selectedElementInfo, setSelectedElementInfo] = useState<{
    tagName?: string;
    selector?: string;
    outerHTML?: string;
    innerText?: string;
  } | null>(null);
  const [elementEditPrompt, setElementEditPrompt] = useState<string>('');
  const [isEditingElement, setIsEditingElement] = useState<boolean>(false);

  // UI Drawer / Modals
  const [showNewProjectModal, setShowNewProjectModal] = useState<boolean>(false);
  const [newProjectName, setNewProjectName] = useState<string>('');
  const [newProjectDesc, setNewProjectDesc] = useState<string>('');
  const [isEditingFile, setIsEditingFile] = useState<boolean>(false);

  // Mobile sidebar drawer
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState<boolean>(false);
  // On phones, Chat and Preview can't sit side-by-side (too narrow to read) —
  // this tracks which one is currently full-width visible. Desktop (md+)
  // ignores this and always shows both panels side by side.
  const [mobileView, setMobileView] = useState<'chat' | 'preview'>('chat');

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load User Projects
  const loadProjects = async () => {
    try {
      const res = await fetch(`/api/projects?uid=${encodeURIComponent(uid)}`);
      const data = await res.json();
      if (data.success && data.projects) {
        setProjects(data.projects);
        if (data.projects.length > 0 && !activeProjectId) {
          setActiveProjectId(data.projects[0].id);
          setActiveProject(data.projects[0]);
        } else if (activeProjectId) {
          // CRITICAL: keep the currently-open project's files in sync with
          // what was just generated/saved — otherwise the Preview/Code tabs
          // keep showing stale (pre-generation) content forever after the
          // very first load, even though the sidebar list did refresh.
          const refreshed = data.projects.find((p: Project) => p.id === activeProjectId);
          if (refreshed) {
            setActiveProject(refreshed);
          }
        }
      }
    } catch (err) {
      console.error('Error loading projects:', err);
    }
  };

  // Load Project Messages
  const loadProjectMessages = async (projId: string) => {
    try {
      const res = await fetch(`/api/messages?projectId=${projId}&uid=${encodeURIComponent(uid)}`);
      const data = await res.json();
      if (data.success) {
        setMessages(data.messages || []);
      }
    } catch (err) {
      console.error('Error loading messages:', err);
    }
  };

  // Load Vector Memory
  const loadProjectMemory = async (projId: string) => {
    try {
      const res = await fetch(`/api/memory?projectId=${projId}&uid=${encodeURIComponent(uid)}`);
      const data = await res.json();
      if (data.success) {
        setVectorMemories(data.embeddings || []);
      }
    } catch (err) {
      console.error('Error loading memory:', err);
    }
  };

  // Load Lessons Memory
  const loadProjectLessons = async (projId: string) => {
    try {
      const res = await fetch(`/api/lessons?projectId=${projId}&uid=${encodeURIComponent(uid)}`);
      const data = await res.json();
      if (data.success) {
        setLessons(data.lessons || []);
      }
    } catch (err) {
      console.error('Error loading lessons:', err);
    }
  };

  // Delete Lesson
  const handleDeleteLesson = async (lessonId: string) => {
    try {
      const res = await fetch(`/api/lessons?lessonId=${lessonId}&uid=${encodeURIComponent(uid)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        setLessons((prev) => prev.filter((l) => l.id !== lessonId));
      }
    } catch (err) {
      console.error('Error deleting lesson:', err);
    }
  };

  // Load Brand Profile
  const loadBrandProfile = async (projId: string) => {
    try {
      const res = await fetch(`/api/brand?projectId=${projId}`);
      const data = await res.json();
      if (data.success && data.brandProfile) {
        setBrandProfile(data.brandProfile);
        setBrandForm({
          primary_color: data.brandProfile.primary_color || '#3b82f6',
          secondary_color: data.brandProfile.secondary_color || '#1e293b',
          accent_color: data.brandProfile.accent_color || '#f59e0b',
          font_family: data.brandProfile.font_family || 'Inter, sans-serif',
          tone: data.brandProfile.tone || 'professional',
          logo_description: data.brandProfile.logo_description || '',
          additional_notes: data.brandProfile.additional_notes || '',
        });
      } else {
        setBrandProfile(null);
      }
    } catch (err) {
      console.error('Error loading brand profile:', err);
    }
  };

  // Save Brand Profile
  const handleSaveBrandProfile = async () => {
    if (!activeProjectId) return;
    setIsSavingBrand(true);
    try {
      const res = await fetch('/api/brand', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: activeProjectId,
          brandProfile: brandForm,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setBrandProfile(data.brandProfile);
        alert('Brand Profile saved successfully!');
      }
    } catch (err) {
      console.error('Error saving brand profile:', err);
    } finally {
      setIsSavingBrand(false);
    }
  };

  // Load Form Submissions
  const loadFormSubmissions = async (projId: string) => {
    try {
      setIsLoadingSubmissions(true);
      const res = await fetch(`/api/forms/list?projectId=${projId}&uid=${encodeURIComponent(uid)}`);
      const data = await res.json();
      if (data.success) {
        setFormSubmissions(data.submissions || []);
      }
    } catch (err) {
      console.error('Error loading form submissions:', err);
    } finally {
      setIsLoadingSubmissions(false);
    }
  };

  // ---- Spec / Requirement Management ----
  const loadSpec = async (projId: string) => {
    try {
      const res = await fetch(`/api/spec?projectId=${projId}&uid=${encodeURIComponent(uid)}`);
      const data = await res.json();
      if (data.success) setActiveSpec(data.spec || null);
    } catch (err) {
      console.error('Error loading spec:', err);
    }
  };

  const handleGenerateSpec = async () => {
    if (!activeProjectId || !specRequirementDraft.trim()) return;
    setIsGeneratingSpec(true);
    try {
      const res = await fetch(`/api/spec?uid=${encodeURIComponent(uid)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: activeProjectId, rawRequirement: specRequirementDraft }),
      });
      const data = await res.json();
      if (data.success) {
        setActiveSpec(data.spec);
        setSpecRequirementDraft('');
      } else {
        alert(`Could not generate spec: ${data.error}`);
      }
    } catch (err) {
      console.error('Error generating spec:', err);
    } finally {
      setIsGeneratingSpec(false);
    }
  };

  const handleApproveSpec = async () => {
    if (!activeSpec) return;
    try {
      await fetch('/api/spec', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ specId: activeSpec.id, status: 'approved' }),
      });
      setActiveSpec({ ...activeSpec, status: 'approved' });
    } catch (err) {
      console.error('Error approving spec:', err);
    }
  };

  // ---- Team Collaboration ----
  const loadMembers = async (projId: string) => {
    try {
      const res = await fetch(`/api/members?projectId=${projId}&uid=${encodeURIComponent(uid)}`);
      const data = await res.json();
      if (data.success) {
        setProjectMembers(data.members || []);
        setMyProjectRole(data.myRole || null);
      }
    } catch (err) {
      console.error('Error loading members:', err);
    }
  };

  const handleInviteMember = async () => {
    if (!activeProjectId || !inviteUidDraft.trim()) return;
    setIsInvitingMember(true);
    try {
      const res = await fetch(`/api/members?uid=${encodeURIComponent(uid)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: activeProjectId, inviteeUid: inviteUidDraft.trim(), role: inviteRoleDraft }),
      });
      const data = await res.json();
      if (data.success) {
        setInviteUidDraft('');
        loadMembers(activeProjectId);
      } else {
        alert(`Could not invite member: ${data.error}`);
      }
    } catch (err) {
      console.error('Error inviting member:', err);
    } finally {
      setIsInvitingMember(false);
    }
  };

  const handleRemoveMember = async (memberUserId: string) => {
    if (!activeProjectId) return;
    if (!confirm('Remove this member from the project?')) return;
    try {
      await fetch(`/api/members?projectId=${activeProjectId}&memberUid=${encodeURIComponent(memberUserId)}&uid=${encodeURIComponent(uid)}`, {
        method: 'DELETE',
      });
      loadMembers(activeProjectId);
    } catch (err) {
      console.error('Error removing member:', err);
    }
  };

  // ---- Pull Requests ----
  const loadPullRequests = async (projId: string) => {
    try {
      const res = await fetch(`/api/pull-requests?projectId=${projId}`);
      const data = await res.json();
      if (data.success) setPullRequests(data.pullRequests || []);
    } catch (err) {
      console.error('Error loading pull requests:', err);
    }
  };

  // Visual Click-to-Edit Element Submit
  const handleElementEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProjectId || !selectedElementInfo || !elementEditPrompt.trim()) return;
    setIsEditingElement(true);
    try {
      const res = await fetch('/api/element-edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: activeProjectId,
          uid,
          elementInfo: selectedElementInfo,
          instruction: elementEditPrompt.trim(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setShowElementEditModal(false);
        setElementEditPrompt('');
        setSelectedElementInfo(null);
        await loadProjects();
        await loadProjectMessages(activeProjectId);
      } else {
        alert(`Element edit failed: ${data.error}`);
      }
    } catch (err) {
      console.error('Error editing element:', err);
      alert('Failed to execute targeted element edit.');
    } finally {
      setIsEditingElement(false);
    }
  };

  // Listen for iframe element click message for visual edit
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'ELEMENT_CLICKED') {
        setSelectedElementInfo(event.data.elementInfo);
        setShowElementEditModal(true);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Polling for Task Plan Status updates during autonomous multi-step execution
  useEffect(() => {
    if (!activeProjectId) return;
    const fetchStatus = async () => {
      try {
        const res = await fetch(`/api/task-status?projectId=${activeProjectId}`);
        const data = await res.json();
        if (data.success && data.taskPlan) {
          setActiveTaskPlan(data.taskPlan);
        } else {
          setActiveTaskPlan(null);
        }
      } catch (err) {
        // silent catch
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 2000);
    return () => clearInterval(interval);
  }, [activeProjectId]);

  // Load Settings
  const loadSettings = async () => {
    try {
      const res = await fetch(`/api/settings?uid=${encodeURIComponent(uid)}`);
      const data = await res.json();
      if (data.success && data.settings) {
        setSettings(data.settings);
      }
    } catch (err) {
      console.error('Error loading settings:', err);
    }
  };

  // Fetch projects on UID change
  useEffect(() => {
    let isMounted = true;
    if (!uid) return;
    
    fetch(`/api/projects?uid=${encodeURIComponent(uid)}`)
      .then((res) => res.json())
      .then((data) => {
        if (isMounted && data.success && data.projects) {
          setProjects(data.projects);
          if (data.projects.length > 0 && !activeProjectId) {
            setActiveProjectId(data.projects[0].id);
            setActiveProject(data.projects[0]);
          }
        }
      });

    fetch(`/api/settings?uid=${encodeURIComponent(uid)}`)
      .then((res) => res.json())
      .then((data) => {
        if (isMounted && data.success && data.settings) {
          setSettings(data.settings);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [uid, activeProjectId]);

  // Fetch messages, memory, and lessons whenever activeProjectId changes
  useEffect(() => {
    let isMounted = true;
    if (!activeProjectId) return;

    fetch(`/api/messages?projectId=${activeProjectId}&uid=${encodeURIComponent(uid)}`)
      .then((res) => res.json())
      .then((data) => {
        if (isMounted && data.success) {
          setMessages(data.messages || []);
        }
      });

    fetch(`/api/memory?projectId=${activeProjectId}&uid=${encodeURIComponent(uid)}`)
      .then((res) => res.json())
      .then((data) => {
        if (isMounted && data.success) {
          setVectorMemories(data.embeddings || []);
        }
      });

    fetch(`/api/lessons?projectId=${activeProjectId}&uid=${encodeURIComponent(uid)}`)
      .then((res) => res.json())
      .then((data) => {
        if (isMounted && data.success) {
          setLessons(data.lessons || []);
        }
      });

    queueMicrotask(() => {
      if (isMounted) {
        loadBrandProfile(activeProjectId);
        loadFormSubmissions(activeProjectId);
      }
    });

    const curr = projects.find((p) => p.id === activeProjectId);
    if (curr) {
      queueMicrotask(() => {
        if (isMounted) {
          setActiveProject(curr);
          const files = Object.keys(curr.files || {});
          if (files.length > 0 && !files.includes(selectedFile)) {
            setSelectedFile(files[0]);
            setEditedFileContent(curr.files[files[0]]);
          } else if (curr.files?.[selectedFile]) {
            setEditedFileContent(curr.files[selectedFile]);
          }
        }
      });
    }

    return () => {
      isMounted = false;
    };
  }, [activeProjectId, uid, projects, selectedFile]);

  // Create Project
  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return;
    try {
      const res = await fetch(`/api/projects?uid=${encodeURIComponent(uid)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newProjectName,
          description: newProjectDesc,
          files: {
            'index.html': `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${newProjectName}</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-zinc-950 text-zinc-100 min-h-screen flex items-center justify-center p-6">
  <div class="max-w-xl text-center space-y-4">
    <h1 class="text-4xl font-bold text-white">${newProjectName}</h1>
    <p class="text-zinc-400">${newProjectDesc || 'Start prompting the agent to build your website.'}</p>
  </div>
</body>
</html>`,
          },
        }),
      });

      const data = await res.json();
      if (data.success && data.project) {
        setProjects([data.project, ...projects]);
        setActiveProjectId(data.project.id);
        setActiveProject(data.project);
        setShowNewProjectModal(false);
        setNewProjectName('');
        setNewProjectDesc('');
      }
    } catch (err) {
      console.error('Error creating project:', err);
    }
  };

  // Delete Project
  const handleDeleteProject = async (id: string) => {
    if (!confirm('Are you sure you want to delete this project?')) return;
    try {
      const res = await fetch(`/api/projects?projectId=${id}&uid=${encodeURIComponent(uid)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success && data.deleted) {
        const remaining = projects.filter((p) => p.id !== id);
        setProjects(remaining);
        if (remaining.length > 0) {
          setActiveProjectId(remaining[0].id);
        } else {
          setActiveProjectId('');
          setActiveProject(null);
        }
      } else if (data.success && !data.deleted) {
        alert('Project could not be deleted (it may not belong to this user session, or was already removed). Refreshing project list...');
        await loadProjects();
      } else {
        alert(`Delete failed: ${data.error || 'Unknown server error'}`);
      }
    } catch (err) {
      console.error('Error deleting project:', err);
      alert('Delete failed: could not reach the server. Check your connection and try again.');
    }
  };

  // Save Settings
  // Handles pasting a full GitHub URL into the Owner or Repository Name
  // fields (e.g. "https://github.com/Goutam3419/my-repo") — extracts just
  // the relevant segment instead of leaving the raw URL, which the GitHub
  // API rejects as an invalid owner/repo.
  const cleanGithubField = (value: string, part: 'owner' | 'repo'): string => {
    const trimmed = value.trim();
    const match = trimmed.match(/github\.com\/([^\/\s]+)\/?([^\/\s]+)?/i);
    if (match) {
      const owner = match[1] || '';
      const repo = (match[2] || '').replace(/\.git$/i, '');
      return part === 'owner' ? owner : repo;
    }
    return trimmed.replace(/\.git$/i, '');
  };

  const handleSaveSettings = async () => {
    try {
      const res = await fetch(`/api/settings?uid=${encodeURIComponent(uid)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      if (data.success) {
        alert('Settings saved successfully!');
        setShowSettingsModal(false);
        if (data.status) {
          const newResults: any = {};
          if (data.status.github)
            newResults.github = {
              connected: data.status.github.connected,
              message: data.status.github.connected
                ? `Connected as @${data.status.github.user}`
                : data.status.github.error,
            };
          if (data.status.vercel)
            newResults.vercel = {
              connected: data.status.vercel.connected,
              message: data.status.vercel.connected
                ? `Connected as @${data.status.vercel.user}`
                : data.status.vercel.error,
            };
          if (data.status.firebase)
            newResults.firebase = {
              connected: data.status.firebase.connected,
              message: data.status.firebase.connected ? 'Realtime DB Connected' : data.status.firebase.error,
            };
          setTestResults(newResults);
        }
      }
    } catch (err) {
      console.error('Error saving settings:', err);
    }
  };

  // Per-service fields — only these are sent for a given service's
  // Connect/Disconnect action, so connecting GitHub never touches
  // Vercel/Firebase fields and vice versa (the backend already merges
  // partial updates correctly; this just scopes what the frontend sends).
  const SERVICE_FIELDS: Record<'github' | 'vercel' | 'firebase', (keyof UserSettings)[]> = {
    github: ['github_token', 'github_owner', 'github_repo'],
    vercel: ['vercel_token'],
    firebase: ['firebase_db_url', 'firebase_secret'],
  };

  // Connects (or re-tests) ONE service independently — e.g. clicking
  // "Connect" on the GitHub card only sends github_token/owner/repo, so a
  // user can connect just GitHub without ever touching Vercel or Firebase.
  const handleConnectService = async (service: 'github' | 'vercel' | 'firebase') => {
    setTestingConnection(service);
    try {
      const payload: Record<string, string> = {};
      for (const field of SERVICE_FIELDS[service]) {
        payload[field] = (settings[field] as string) || '';
      }
      const res = await fetch(`/api/settings?uid=${encodeURIComponent(uid)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!data.success) {
        // The request itself failed server-side (not just "not connected") —
        // show the real error instead of a generic placeholder message.
        setTestResults((prev) => ({
          ...prev,
          [service]: { connected: false, message: data.error || `Server error while connecting ${service}.` },
        }));
        return;
      }

      if (data.settings) {
        setSettings({ ...settings, ...data.settings });
      }
      const statusForService = data.status?.[service];
      if (statusForService) {
        setTestResults((prev) => ({
          ...prev,
          [service]: {
            connected: statusForService.connected,
            message: statusForService.connected
              ? service === 'firebase'
                ? 'Realtime DB Connected'
                : `Connected as @${statusForService.user}`
              : statusForService.error || 'Connection failed',
          },
        }));
      } else {
        setTestResults((prev) => ({
          ...prev,
          [service]: { connected: false, message: 'Please enter credentials for this service before connecting.' },
        }));
      }
    } catch (err) {
      console.error(`Error connecting ${service}:`, err);
      setTestResults((prev) => ({
        ...prev,
        [service]: { connected: false, message: 'Could not reach the server.' },
      }));
    } finally {
      setTestingConnection('');
    }
  };

  // Clears ONE service's credentials only — the other two services'
  // settings are untouched, both in the DB and in local UI state.
  const handleDisconnectService = async (service: 'github' | 'vercel' | 'firebase') => {
    if (!confirm(`Disconnect ${service.charAt(0).toUpperCase() + service.slice(1)}? You can reconnect any time.`)) return;
    try {
      const payload: Record<string, string> = {};
      for (const field of SERVICE_FIELDS[service]) {
        payload[field] = '';
      }
      const res = await fetch(`/api/settings?uid=${encodeURIComponent(uid)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        setSettings((prev) => ({ ...prev, ...payload }));
        setTestResults((prev) => {
          const next = { ...prev };
          delete next[service];
          return next;
        });
      }
    } catch (err) {
      console.error(`Error disconnecting ${service}:`, err);
    }
  };

  // Trigger Claude-like AI Agent
  const handleSendPrompt = async (customPrompt?: string) => {
    const promptToUse = customPrompt || promptInput;
    if (!promptToUse.trim() || !activeProjectId || isAgentRunning) return;

    setIsAgentRunning(true);
    setPromptInput('');

    const tempUserMsg: Message = {
      id: `temp_msg_${messages.length + 1}`,
      project_id: activeProjectId,
      role: 'user',
      content: promptToUse,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);

    try {
      const res = await fetch(`/api/agent?uid=${encodeURIComponent(uid)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: activeProjectId,
          prompt: promptToUse,
          autoDeploy,
        }),
      });

      const data = await res.json();
      if (data.success && data.result) {
        // Reload project to update files & live URL
        await loadProjects();
        await loadProjectMessages(activeProjectId);
        await loadProjectMemory(activeProjectId);
        await loadProjectLessons(activeProjectId);
      } else {
        alert(`Agent Error: ${data.error || 'Failed to complete task'}`);
      }
    } catch (err: any) {
      console.error('Agent execution exception:', err);
      alert('Error triggering AI agent.');
    } finally {
      setIsAgentRunning(false);
    }
  };

  // Save Manual File Edit
  const handleSaveFileEdit = async () => {
    if (!activeProject || !selectedFile) return;
    const updatedFiles = { ...activeProject.files, [selectedFile]: editedFileContent };
    try {
      const res = await fetch(`/api/projects/${activeProject.id}?uid=${encodeURIComponent(uid)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: updatedFiles }),
      });
      const data = await res.json();
      if (data.success) {
        setActiveProject(data.project);
        setIsEditingFile(false);
        // Refresh project list
        setProjects(projects.map((p) => (p.id === data.project.id ? data.project : p)));
      }
    } catch (err) {
      console.error('Error updating file:', err);
    }
  };

  // Manual Trigger Integrations
  const handleManualGitHubPush = async () => {
    if (!activeProjectId) return;
    try {
      const res = await fetch(`/api/github?uid=${encodeURIComponent(uid)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: activeProjectId }),
      });
      const data = await res.json();
      if (data.success) {
        alert(`Successfully pushed commit to GitHub!\nCommit URL: ${data.result.commitUrl}`);
      } else {
        alert(`GitHub Push Failed: ${data.error}`);
      }
    } catch (err) {
      console.error('GitHub Push error:', err);
    }
  };

  const handleManualVercelDeploy = async () => {
    if (!activeProjectId) return;
    try {
      const res = await fetch(`/api/vercel?uid=${encodeURIComponent(uid)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: activeProjectId }),
      });
      const data = await res.json();
      if (data.success && data.result.url) {
        alert(`Deployed successfully to Vercel!\nLive URL: ${data.result.url}`);
        await loadProjects();
      } else {
        alert(`Vercel Deploy Failed: ${data.error}`);
      }
    } catch (err) {
      console.error('Vercel Deploy error:', err);
    }
  };

  const handleManualFirebaseSync = async () => {
    if (!activeProjectId) return;
    try {
      const res = await fetch(`/api/firebase?uid=${encodeURIComponent(uid)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: activeProjectId }),
      });
      const data = await res.json();
      if (data.success) {
        alert('Synced project files to Firebase Realtime Database!');
      } else {
        alert(`Firebase Sync Failed: ${data.error}`);
      }
    } catch (err) {
      console.error('Firebase Sync error:', err);
    }
  };

  // Export Project as ZIP
  const handleExportZip = async () => {
    if (!activeProject || !activeProject.files) return;
    const zip = new JSZip();
    Object.entries(activeProject.files).forEach(([filePath, content]) => {
      zip.file(filePath.replace(/^\/+/, ''), content);
    });
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeProject.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Render HTML preview iframe
  const renderPreviewContent = () => {
    if (!activeProject || !activeProject.files) return '';
    let rawHtml = '';
    if (activeProject.files['index.html']) {
      rawHtml = activeProject.files['index.html'];
    } else {
      const htmlFile = Object.keys(activeProject.files).find((f) => f.endsWith('.html'));
      rawHtml = htmlFile ? activeProject.files[htmlFile] : '<html><body><p>No previewable index.html found.</p></body></html>';
    }

    if (!isEditModeActive) return rawHtml;

    const script = `
<script>
(function() {
  let hoveredEl = null;
  const style = document.createElement('style');
  style.id = 'c2e-style';
  style.innerHTML = \`
    .c2e-hover {
      outline: 2px dashed #6366f1 !important;
      outline-offset: 2px !important;
      cursor: crosshair !important;
    }
  \`;
  document.head.appendChild(style);

  function getSelector(el) {
    if (el.id) return '#' + el.id;
    if (el.className && typeof el.className === 'string') {
      const cls = el.className.split(/\\s+/).filter(c => c && !c.startsWith('c2e-')).join('.');
      if (cls) return el.tagName.toLowerCase() + '.' + cls;
    }
    return el.tagName.toLowerCase();
  }

  document.addEventListener('mouseover', function(e) {
    if (hoveredEl) hoveredEl.classList.remove('c2e-hover');
    hoveredEl = e.target;
    if (hoveredEl && hoveredEl !== document.body && hoveredEl !== document.documentElement) {
      hoveredEl.classList.add('c2e-hover');
    }
  }, true);

  document.addEventListener('mouseout', function(e) {
    if (e.target) e.target.classList.remove('c2e-hover');
  }, true);

  document.addEventListener('click', function(e) {
    e.preventDefault();
    e.stopPropagation();
    const target = e.target;
    if (!target || target === document.body || target === document.documentElement) return;
    const info = {
      tagName: target.tagName ? target.tagName.toLowerCase() : 'element',
      selector: getSelector(target),
      outerHTML: target.outerHTML ? target.outerHTML.substring(0, 1500) : '',
      innerText: target.innerText ? target.innerText.substring(0, 300) : '',
    };
    window.parent.postMessage({ type: 'ELEMENT_CLICKED', elementInfo: info }, '*');
  }, true);
})();
</script>
`;

    if (rawHtml.includes('</body>')) {
      return rawHtml.replace('</body>', `${script}\n</body>`);
    }
    return rawHtml + script;
  };

  return (
    <div className="flex flex-col h-screen bg-zinc-950 text-zinc-100 font-sans overflow-hidden">
      {/* HEADER BAR */}
      <header className="h-14 border-b border-zinc-800 bg-zinc-900/80 backdrop-blur-md px-4 flex items-center justify-between z-20">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
            className="md:hidden p-2 text-zinc-400 hover:text-white rounded-lg bg-zinc-800"
          >
            <Layers className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 via-violet-600 to-pink-500 flex items-center justify-center font-black text-white shadow-lg">
              <Sparkles className="w-4 h-4" />
            </div>
            <span className="font-bold text-base sm:text-lg tracking-tight bg-gradient-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-transparent truncate max-w-[140px] sm:max-w-none">
              Website Builder Agent
            </span>
          </div>
        </div>

        {/* INTEGRATION STATUS & ACTIONS */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* User ID Badge */}
          <button
            onClick={() => setShowUidModal(true)}
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800/80 hover:bg-zinc-800 border border-zinc-700 text-xs font-mono text-zinc-300 transition"
          >
            <Cpu className="w-3.5 h-3.5 text-indigo-400" />
            <span>UID: {uid.substring(0, 10)}...</span>
          </button>

          {/* Integration Status Pills */}
          <div className="hidden lg:flex items-center gap-2 text-xs">
            <span
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full border ${
                settings.github_token
                  ? 'bg-emerald-950/40 border-emerald-800 text-emerald-400'
                  : 'bg-zinc-800/40 border-zinc-800 text-zinc-500'
              }`}
            >
              <Github className="w-3 h-3" />
              GitHub
            </span>
            <span
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full border ${
                settings.vercel_token
                  ? 'bg-emerald-950/40 border-emerald-800 text-emerald-400'
                  : 'bg-zinc-800/40 border-zinc-800 text-zinc-500'
              }`}
            >
              <Zap className="w-3 h-3" />
              Vercel
            </span>
            <span
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full border ${
                settings.firebase_db_url
                  ? 'bg-emerald-950/40 border-emerald-800 text-emerald-400'
                  : 'bg-zinc-800/40 border-zinc-800 text-zinc-500'
              }`}
            >
              <Flame className="w-3 h-3" />
              Firebase
            </span>
          </div>

          {/* Settings Button */}
          <button
            onClick={() => setShowSettingsModal(true)}
            className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition"
            title="Configure Tokens & Integrations"
          >
            <Settings className="w-4 h-4" />
          </button>

          {/* Export Zip */}
          <button
            onClick={handleExportZip}
            disabled={!activeProject}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium shadow transition disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Export ZIP</span>
          </button>
        </div>
      </header>

      {/* MOBILE-ONLY: Chat / Preview switcher (panels can't sit side by side on a phone screen) */}
      <div className="md:hidden flex items-center gap-1 p-1.5 bg-zinc-900 border-b border-zinc-800">
        <button
          onClick={() => setMobileView('chat')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold transition ${
            mobileView === 'chat' ? 'bg-indigo-600 text-white shadow' : 'text-zinc-400 bg-zinc-800/60'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          Chat / Build
        </button>
        <button
          onClick={() => setMobileView('preview')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold transition ${
            mobileView === 'preview' ? 'bg-indigo-600 text-white shadow' : 'text-zinc-400 bg-zinc-800/60'
          }`}
        >
          <Monitor className="w-4 h-4" />
          Preview
        </button>
      </div>

      {/* MAIN CONTAINER (3 PANEL SPLIT VIEW) */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Mobile-only dim backdrop behind the sidebar drawer — tap it to close */}
        {isMobileSidebarOpen && (
          <div
            onClick={() => setIsMobileSidebarOpen(false)}
            className="md:hidden fixed inset-0 bg-black/60 z-20"
          />
        )}
        {/* LEFT SIDEBAR (PROJECTS & ARCHITECTURE) */}
        <aside
          className={`w-64 bg-zinc-900 border-r border-zinc-800 flex flex-col justify-between absolute md:relative inset-y-0 left-0 z-30 transform transition-transform duration-200 ${
            isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
          }`}
        >
          <div className="p-4 space-y-4 flex-1 overflow-y-auto">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Projects</span>
              <button
                onClick={() => setShowNewProjectModal(true)}
                className="p-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white"
                title="New Project"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            {/* Project List */}
            <div className="space-y-1">
              {projects.map((p) => {
                const isActive = p.id === activeProjectId;
                return (
                  <div
                    key={p.id}
                    onClick={() => {
                      setActiveProjectId(p.id);
                      setIsMobileSidebarOpen(false);
                    }}
                    className={`group flex items-center justify-between p-2.5 rounded-xl text-sm font-medium cursor-pointer transition ${
                      isActive
                        ? 'bg-indigo-600/10 border border-indigo-500/30 text-indigo-300'
                        : 'hover:bg-zinc-800/60 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <Code className={`w-4 h-4 ${isActive ? 'text-indigo-400' : 'text-zinc-500'}`} />
                      <span className="truncate">{p.name}</span>
                    </div>
                    {isActive && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteProject(p.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 hover:text-rose-400 transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Active Project Footer Details */}
          {activeProject && (
            <div className="p-4 border-t border-zinc-800 bg-zinc-950/40 space-y-2 text-xs">
              <div className="flex justify-between items-center text-zinc-400">
                <span>Active Files:</span>
                <span className="font-mono text-zinc-200">{Object.keys(activeProject.files || {}).length}</span>
              </div>
              {activeProject.live_url && (
                <a
                  href={activeProject.live_url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between text-indigo-400 hover:underline pt-1"
                >
                  <span className="truncate">Live Vercel URL</span>
                  <ExternalLink className="w-3 h-3 ml-1 shrink-0" />
                </a>
              )}
            </div>
          )}
        </aside>

        {/* MIDDLE CHAT / CLAUDE-LIKE AGENT PANEL */}
        <main
          className={`${
            mobileView === 'chat' ? 'flex' : 'hidden'
          } md:flex flex-1 w-full md:w-auto flex-col bg-zinc-950 overflow-hidden border-r border-zinc-800 min-w-0`}
        >
          {/* Messages Feed */}
          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            {!activeProjectId ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-4 max-w-md mx-auto">
                <div className="w-12 h-12 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shadow-xl">
                  <Plus className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-white">No Projects Yet</h3>
                <p className="text-sm text-zinc-400 leading-relaxed">
                  You don't have any projects right now. Create one to start building — the agent will pick up from here.
                </p>
                <button
                  onClick={() => setShowNewProjectModal(true)}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium shadow transition"
                >
                  <Plus className="w-4 h-4" />
                  Create Your First Project
                </button>
              </div>
            ) : messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-4 max-w-md mx-auto">
                <div className="w-12 h-12 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shadow-xl">
                  <Brain className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-white">Claude-Style Agent Engine Ready</h3>
                <p className="text-sm text-zinc-400 leading-relaxed">
                  Describe what website or web application you want to build. The agent will formulate an architectural plan, generate/edit code files, auto-validate syntax, and execute deployments.
                </p>

                {/* Quick Prompts */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full pt-4 text-left">
                  {[
                    'SaaS Landing Page with dark theme and pricing table',
                    'Developer Portfolio with filterable project gallery',
                    'Analytics Dashboard with responsive cards',
                    'Contact Form with reactive state & validation',
                  ].map((preset, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSendPrompt(preset)}
                      className="p-3 text-xs bg-zinc-900 border border-zinc-800 hover:border-indigo-500/50 hover:bg-zinc-800/80 rounded-xl text-zinc-300 transition text-left space-y-1"
                    >
                      <div className="font-medium text-white flex items-center gap-1">
                        <Sparkles className="w-3 h-3 text-indigo-400" /> Preset {idx + 1}
                      </div>
                      <div className="line-clamp-2 text-zinc-400">{preset}</div>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((msg) => {
                const isUser = msg.role === 'user';
                return (
                  <div key={msg.id} className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
                    {!isUser && (
                      <div className="w-8 h-8 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0 mt-1">
                        <Sparkles className="w-4 h-4" />
                      </div>
                    )}

                    <div
                      className={`max-w-2xl rounded-2xl p-4 text-sm space-y-3 ${
                        isUser
                          ? 'bg-indigo-600 text-white rounded-br-none'
                          : 'bg-zinc-900 border border-zinc-800 text-zinc-200 rounded-bl-none shadow-xl'
                      }`}
                    >
                      {/* Message Content */}
                      <div className="whitespace-pre-wrap leading-relaxed">{msg.content}</div>

                      {/* Multi-step Execution Steps if assistant */}
                      {!isUser && msg.step_details && msg.step_details.length > 0 && (
                        <div className="pt-2 border-t border-zinc-800/80 space-y-1.5 text-xs font-mono">
                          <div className="text-zinc-400 font-sans font-semibold flex items-center gap-1.5">
                            <Terminal className="w-3.5 h-3.5 text-indigo-400" /> Execution Pipeline Logs:
                          </div>
                          {msg.step_details.map((st, sIdx) => (
                            <div key={sIdx} className="flex items-center justify-between text-zinc-400">
                              <span className="flex items-center gap-2">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                {st.step}
                              </span>
                              <span className="text-emerald-400 font-semibold">{st.status}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Action Triggers if assistant */}
                      {!isUser && (
                        <div className="pt-2 flex flex-wrap gap-2">
                          {msg.content.includes('Quick Action Available') && (
                            <button
                              onClick={() => {
                                const match = msg.content.match(/Quick Action Available\*:\s*"([^"]+)"/);
                                const promptText = match ? match[1] : 'Apply suggested improvement';
                                handleSendPrompt(promptText);
                              }}
                              className="w-full px-3 py-2 bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 hover:from-indigo-500 hover:to-pink-500 text-white font-bold text-xs rounded-xl shadow-lg transition flex items-center justify-center gap-2 mb-1"
                            >
                              <Sparkles className="w-3.5 h-3.5" /> Quick Action: Apply Proactive Fix
                            </button>
                          )}
                          <button
                            onClick={handleManualGitHubPush}
                            className="flex items-center gap-1 px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-medium transition"
                          >
                            <Github className="w-3 h-3 text-emerald-400" /> Push to GitHub
                          </button>
                          <button
                            onClick={handleManualVercelDeploy}
                            className="flex items-center gap-1 px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-medium transition"
                          >
                            <Zap className="w-3 h-3 text-indigo-400" /> Deploy to Vercel
                          </button>
                          <button
                            onClick={handleManualFirebaseSync}
                            className="flex items-center gap-1 px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-medium transition"
                          >
                            <Flame className="w-3 h-3 text-amber-400" /> Sync Firebase
                          </button>
                        </div>
                      )}
                    </div>

                    {isUser && (
                      <div className="w-8 h-8 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-300 shrink-0 mt-1 font-bold text-xs">
                        U
                      </div>
                    )}
                  </div>
                );
              })
            )}

            {/* Agent Running Indicator */}
            {isAgentRunning && (
              <div className="flex gap-3 justify-start">
                <div className="w-8 h-8 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0 animate-pulse">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 text-sm text-zinc-300 space-y-2 max-w-lg shadow-xl">
                  <div className="flex items-center gap-2 font-semibold text-indigo-400">
                    <Sparkles className="w-4 h-4" /> Agentic Multi-Step Reasoning in progress...
                  </div>
                  <div className="text-xs text-zinc-400 font-mono space-y-1">
                    <div>✓ Phase 1: Planning file structure</div>
                    <div>✓ Phase 2: Generating component code</div>
                    <div>⏳ Phase 3: Validating syntax & bracket balance...</div>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Prompt Bar */}
          <div className="p-3 sm:p-4 border-t border-zinc-800 bg-zinc-900/90 backdrop-blur-md space-y-3">
            {/* AUTONOMOUS TASK DECOMPOSITION PROGRESS WIDGET — only shown WHILE
                the agent is actively working. Once done, this disappears;
                the completed summary already lives in the chat message's
                own "Execution Pipeline Logs" section, so nothing is lost. */}
            {activeTaskPlan && activeTaskPlan.overall_status === 'in_progress' && activeTaskPlan.tasks && activeTaskPlan.tasks.length > 0 && (
              <div className="bg-zinc-950 border border-indigo-900/60 rounded-2xl p-3.5 shadow-2xl space-y-2.5 font-sans">
                <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                  <div className="flex items-center gap-2">
                    <Brain className="w-4 h-4 text-indigo-400 animate-pulse" />
                    <span className="font-bold text-xs text-white">Task Plan Execution ({activeTaskPlan.tasks.filter((t) => t.status === 'completed').length}/{activeTaskPlan.tasks.length})</span>
                  </div>
                  <span
                    className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${
                      activeTaskPlan.overall_status === 'in_progress'
                        ? 'bg-indigo-950 text-indigo-300 border border-indigo-800 animate-pulse'
                        : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                    }`}
                  >
                    {activeTaskPlan.overall_status.toUpperCase()}
                  </span>
                </div>

                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {activeTaskPlan.tasks.map((t, idx) => (
                    <div key={t.id || idx} className="flex items-start gap-2 text-xs">
                      {t.status === 'completed' && <CheckCircle className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />}
                      {t.status === 'in_progress' && <RefreshCw className="w-3.5 h-3.5 text-indigo-400 animate-spin mt-0.5 shrink-0" />}
                      {t.status === 'skipped' && <AlertTriangle className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />}
                      {t.status === 'failed' && <AlertCircle className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />}
                      {t.status === 'pending' && <div className="w-3.5 h-3.5 rounded-full border border-zinc-700 mt-0.5 shrink-0" />}

                      <div className="space-y-0.5 min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <span
                            className={`font-medium text-xs ${
                              t.status === 'completed'
                                ? 'text-zinc-400 line-through'
                                : t.status === 'in_progress'
                                ? 'text-indigo-300 font-bold'
                                : 'text-zinc-400'
                            }`}
                          >
                            Task {idx + 1}: {t.description}
                          </span>
                          {t.retry_count > 0 && (
                            <span className="text-[10px] text-amber-400 font-mono">Retry #{t.retry_count}</span>
                          )}
                        </div>
                        {t.result_summary && <p className="text-[10px] text-zinc-500 font-mono truncate">{t.result_summary}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between text-xs text-zinc-400 px-1">
              <label className="flex items-center gap-2 cursor-pointer hover:text-white transition">
                <input
                  type="checkbox"
                  checked={autoDeploy}
                  onChange={(e) => setAutoDeploy(e.target.checked)}
                  className="rounded bg-zinc-800 border-zinc-700 text-indigo-600 focus:ring-0"
                />
                <span>Auto-Deploy to Vercel after code generation</span>
              </label>
              <span className="font-mono text-zinc-500">Shift+Enter for newline</span>
            </div>

            <div className="flex items-end gap-2 bg-zinc-950 border border-zinc-800 focus-within:border-indigo-500 rounded-2xl p-2 transition">
              <textarea
                value={promptInput}
                onChange={(e) => setPromptInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendPrompt();
                  }
                }}
                placeholder="Ask agent to build, modify, or add features..."
                rows={2}
                className="flex-1 bg-transparent border-none text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none resize-none p-2"
              />
              <button
                onClick={() => handleSendPrompt()}
                disabled={!promptInput.trim() || isAgentRunning}
                className="p-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl shadow-lg transition disabled:opacity-40"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </main>

        {/* RIGHT PANEL (LIVE PREVIEW & CODE INSPECTOR) */}
        <section
          className={`${
            mobileView === 'preview' ? 'flex' : 'hidden'
          } md:flex flex-1 w-full md:w-auto flex-col bg-zinc-900 overflow-hidden min-w-0`}
        >
          {/* Tab Controls */}
          <div className="border-b border-zinc-800 bg-zinc-950/60 flex flex-col sm:h-12 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-1 bg-zinc-900 p-1 sm:rounded-xl border-b sm:border border-zinc-800 text-xs font-medium overflow-x-auto whitespace-nowrap [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden mx-2 mt-2 sm:mx-4 sm:mt-0">
              <button
                onClick={() => setActiveTab('preview')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg transition shrink-0 whitespace-nowrap ${
                  activeTab === 'preview' ? 'bg-indigo-600 text-white' : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Globe className="w-3.5 h-3.5" /> Preview
              </button>
              <button
                onClick={() => setActiveTab('code')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg transition shrink-0 whitespace-nowrap ${
                  activeTab === 'code' ? 'bg-indigo-600 text-white' : 'text-zinc-400 hover:text-white'
                }`}
              >
                <FileCode className="w-3.5 h-3.5" /> Code
              </button>
              <button
                onClick={() => setActiveTab('deployments')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg transition shrink-0 whitespace-nowrap ${
                  activeTab === 'deployments' ? 'bg-indigo-600 text-white' : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Zap className="w-3.5 h-3.5" /> Deployments
              </button>
              <button
                onClick={() => setActiveTab('rag')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg transition shrink-0 whitespace-nowrap ${
                  activeTab === 'rag' ? 'bg-indigo-600 text-white' : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Brain className="w-3.5 h-3.5" /> RAG Memory
              </button>
              <button
                onClick={() => {
                  setActiveTab('lessons');
                  if (activeProjectId) loadProjectLessons(activeProjectId);
                }}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg transition shrink-0 whitespace-nowrap ${
                  activeTab === 'lessons' ? 'bg-indigo-600 text-white' : 'text-zinc-400 hover:text-white'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5 text-amber-400" /> Learned ({lessons.length})
              </button>
              <button
                onClick={() => {
                  setActiveTab('brand');
                  if (activeProjectId) loadBrandProfile(activeProjectId);
                }}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg transition shrink-0 whitespace-nowrap ${
                  activeTab === 'brand' ? 'bg-indigo-600 text-white' : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Palette className="w-3.5 h-3.5 text-pink-400" /> Brand
              </button>
              <button
                onClick={() => {
                  setActiveTab('submissions');
                  if (activeProjectId) loadFormSubmissions(activeProjectId);
                }}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg transition shrink-0 whitespace-nowrap ${
                  activeTab === 'submissions' ? 'bg-indigo-600 text-white' : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Inbox className="w-3.5 h-3.5 text-emerald-400" /> Submissions ({formSubmissions.length})
              </button>
              <button
                onClick={() => {
                  setActiveTab('spec');
                  if (activeProjectId) loadSpec(activeProjectId);
                }}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg transition shrink-0 whitespace-nowrap ${
                  activeTab === 'spec' ? 'bg-indigo-600 text-white' : 'text-zinc-400 hover:text-white'
                }`}
              >
                <ClipboardList className="w-3.5 h-3.5 text-sky-400" /> Spec
              </button>
              <button
                onClick={() => {
                  setActiveTab('team');
                  if (activeProjectId) loadMembers(activeProjectId);
                }}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg transition shrink-0 whitespace-nowrap ${
                  activeTab === 'team' ? 'bg-indigo-600 text-white' : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Users className="w-3.5 h-3.5 text-violet-400" /> Team
              </button>
              <button
                onClick={() => {
                  setActiveTab('prs');
                  if (activeProjectId) loadPullRequests(activeProjectId);
                }}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg transition shrink-0 whitespace-nowrap ${
                  activeTab === 'prs' ? 'bg-indigo-600 text-white' : 'text-zinc-400 hover:text-white'
                }`}
              >
                <GitPullRequest className="w-3.5 h-3.5 text-orange-400" /> Pull Requests
              </button>
            </div>

            {/* Viewport & Edit Mode controls for Live Preview */}
            {activeTab === 'preview' && (
              <div className="flex items-center gap-2 mx-2 mb-2 mt-1 sm:mx-4 sm:mb-0 sm:mt-0">
                <button
                  onClick={() => setIsEditModeActive(!isEditModeActive)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition border ${
                    isEditModeActive
                      ? 'bg-indigo-600 text-white border-indigo-500 shadow-md animate-pulse'
                      : 'bg-zinc-800/80 text-zinc-300 border-zinc-700 hover:bg-zinc-800'
                  }`}
                  title="Click elements in preview to edit targeted code"
                >
                  <MousePointerClick className="w-3.5 h-3.5 text-indigo-300" />
                  <span className="hidden sm:inline">{isEditModeActive ? 'Edit Mode ON' : 'Edit Mode OFF'}</span>
                </button>

                <div className="hidden sm:flex items-center gap-1 bg-zinc-900 p-1 rounded-lg border border-zinc-800 text-zinc-400 text-xs">
                  <button
                    onClick={() => setPreviewViewport('desktop')}
                    className={`p-1 rounded ${previewViewport === 'desktop' ? 'bg-zinc-800 text-white' : ''}`}
                  >
                    <Monitor className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setPreviewViewport('tablet')}
                    className={`p-1 rounded ${previewViewport === 'tablet' ? 'bg-zinc-800 text-white' : ''}`}
                  >
                    <Tablet className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setPreviewViewport('mobile')}
                    className={`p-1 rounded ${previewViewport === 'mobile' ? 'bg-zinc-800 text-white' : ''}`}
                  >
                    <Smartphone className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* TAB CONTENT AREA */}
          <div className="flex-1 overflow-hidden relative bg-zinc-950/40">
            {/* 1. LIVE PREVIEW TAB */}
            {activeTab === 'preview' && (
              <div className="w-full h-full flex items-center justify-center p-4 bg-zinc-950/80 overflow-auto">
                <div
                  className={`bg-white rounded-2xl shadow-2xl overflow-hidden border border-zinc-800 transition-all duration-300 ${
                    previewViewport === 'desktop'
                      ? 'w-full h-full'
                      : previewViewport === 'tablet'
                      ? 'w-[768px] h-[90%]'
                      : 'w-[375px] h-[90%]'
                  }`}
                >
                  <iframe
                    srcDoc={renderPreviewContent()}
                    title="Live Website Preview"
                    className="w-full h-full border-none bg-white"
                    sandbox="allow-scripts allow-modals allow-same-origin"
                  />
                </div>
              </div>
            )}

            {/* 2. CODE FILES EDITOR TAB */}
            {activeTab === 'code' && activeProject && (
              <div className="w-full h-full flex overflow-hidden">
                {/* File Selector Sidebar */}
                <div className="w-48 bg-zinc-900 border-r border-zinc-800 p-3 space-y-2 overflow-y-auto">
                  <div className="text-xs font-semibold uppercase text-zinc-400">Project Files</div>
                  <div className="space-y-1">
                    {Object.keys(activeProject.files || {}).map((fName) => (
                      <button
                        key={fName}
                        onClick={() => {
                          setSelectedFile(fName);
                          setEditedFileContent(activeProject.files[fName]);
                          setIsEditingFile(false);
                        }}
                        className={`w-full flex items-center gap-2 p-2 rounded-lg text-xs font-mono transition text-left ${
                          selectedFile === fName
                            ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30'
                            : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'
                        }`}
                      >
                        <FileCode className="w-3.5 h-3.5 shrink-0 text-indigo-400" />
                        <span className="truncate">{fName}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* File Content Editor */}
                <div className="flex-1 flex flex-col bg-zinc-950 font-mono text-xs overflow-hidden">
                  <div className="h-10 border-b border-zinc-800 px-4 flex items-center justify-between bg-zinc-900/50">
                    <span className="text-zinc-300">{selectedFile}</span>
                    <div className="flex items-center gap-2">
                      {isEditingFile ? (
                        <button
                          onClick={handleSaveFileEdit}
                          className="flex items-center gap-1 px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-sans transition"
                        >
                          <Check className="w-3 h-3" /> Save Changes
                        </button>
                      ) : (
                        <button
                          onClick={() => setIsEditingFile(true)}
                          className="flex items-center gap-1 px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-xs font-sans transition"
                        >
                          <Edit3 className="w-3 h-3" /> Edit File
                        </button>
                      )}
                    </div>
                  </div>

                  {isEditingFile ? (
                    <textarea
                      value={editedFileContent}
                      onChange={(e) => setEditedFileContent(e.target.value)}
                      className="flex-1 w-full p-4 bg-zinc-950 text-emerald-400 focus:outline-none resize-none font-mono leading-relaxed"
                    />
                  ) : (
                    <pre className="flex-1 w-full p-4 overflow-auto text-zinc-300 leading-relaxed">
                      <code>{activeProject.files?.[selectedFile] || '// Select or create a file'}</code>
                    </pre>
                  )}
                </div>
              </div>
            )}

            {/* 3. DEPLOYMENTS & LOGS TAB */}
            {activeTab === 'deployments' && (
              <div className="p-6 space-y-6 overflow-y-auto h-full">
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4 shadow-xl">
                  <div className="flex items-center gap-2 font-bold text-white text-base">
                    <Zap className="w-5 h-5 text-indigo-400" /> Live Vercel Status
                  </div>
                  {activeProject?.live_url ? (
                    <div className="p-4 bg-emerald-950/30 border border-emerald-800/60 rounded-xl space-y-2">
                      <div className="text-xs text-emerald-400 font-semibold uppercase">Active Live Deployment</div>
                      <a
                        href={activeProject.live_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-lg font-bold text-white hover:underline flex items-center gap-2"
                      >
                        {activeProject.live_url} <ExternalLink className="w-4 h-4" />
                      </a>
                    </div>
                  ) : (
                    <div className="text-sm text-zinc-400">
                      No live Vercel deployment active yet. Configure Vercel API token in Settings and click &quot;Deploy to Vercel&quot;.
                    </div>
                  )}
                  <button
                    onClick={handleManualVercelDeploy}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-medium shadow transition"
                  >
                    Deploy Current State Now
                  </button>
                </div>

                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4 shadow-xl">
                  <div className="flex items-center gap-2 font-bold text-white text-base">
                    <Github className="w-5 h-5 text-emerald-400" /> GitHub Repository Sync
                  </div>
                  <div className="text-sm text-zinc-400">
                    Repository: <span className="font-mono text-zinc-200">{settings.github_owner || 'Not Set'}/{settings.github_repo || 'Not Set'}</span>
                  </div>
                  <button
                    onClick={handleManualGitHubPush}
                    className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl text-xs font-medium transition"
                  >
                    Push Commit to GitHub
                  </button>
                </div>
              </div>
            )}

            {/* 4. RAG MEMORY TAB */}
            {activeTab === 'rag' && (
              <div className="p-6 space-y-4 overflow-y-auto h-full">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-bold text-white text-base">
                    <Brain className="w-5 h-5 text-indigo-400" /> Vector Memory Context (RAG)
                  </div>
                  <span className="text-xs text-zinc-400 font-mono">{vectorMemories.length} Memories Stored</span>
                </div>

                {vectorMemories.length === 0 ? (
                  <div className="text-sm text-zinc-500 p-8 text-center bg-zinc-900 border border-zinc-800 rounded-2xl">
                    No stored vector embeddings for this project yet. Prompt the agent to generate code and memories!
                  </div>
                ) : (
                  vectorMemories.map((mem) => (
                    <div key={mem.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2 text-xs">
                      <div className="flex justify-between items-center text-indigo-400 font-semibold">
                        <span>{mem.title}</span>
                        <span className="text-zinc-500 font-mono text-[10px]">{mem.created_at}</span>
                      </div>
                      <p className="text-zinc-300 font-mono leading-relaxed whitespace-pre-wrap">{mem.content}</p>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* 5. MISTAKE MEMORY & LESSONS TAB */}
            {activeTab === 'lessons' && (
              <div className="p-6 space-y-4 overflow-y-auto h-full">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-bold text-white text-base">
                    <ShieldCheck className="w-5 h-5 text-indigo-400" /> What The Agent Learned (Self-Learning Memory)
                  </div>
                  <button
                    onClick={() => activeProjectId && loadProjectLessons(activeProjectId)}
                    className="text-xs text-indigo-400 hover:underline flex items-center gap-1 font-mono"
                  >
                    <RefreshCw className="w-3 h-3" /> Refresh
                  </button>
                </div>

                {lessons.length === 0 ? (
                  <div className="text-sm text-zinc-500 p-8 text-center bg-zinc-900 border border-zinc-800 rounded-2xl space-y-2">
                    <Brain className="w-8 h-8 text-zinc-600 mx-auto" />
                    <p className="font-semibold text-zinc-300">No learned rules or mistake memory recorded yet.</p>
                    <p className="text-xs text-zinc-500">The agent automatically learns from code validation checks, user corrections, and style preferences.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {lessons.map((lesson) => {
                      let badgeStyle = 'bg-zinc-800 text-zinc-300 border-zinc-700';
                      if (lesson.lesson_type === 'validation_error') badgeStyle = 'bg-rose-950/60 text-rose-300 border-rose-800/80';
                      else if (lesson.lesson_type === 'user_correction') badgeStyle = 'bg-amber-950/60 text-amber-300 border-amber-800/80';
                      else if (lesson.lesson_type === 'style_preference') badgeStyle = 'bg-sky-950/60 text-sky-300 border-sky-800/80';
                      else if (lesson.lesson_type === 'repeated_failure') badgeStyle = 'bg-purple-950/60 text-purple-300 border-purple-800/80';
                      else if (lesson.lesson_type === 'deployment_failure') badgeStyle = 'bg-orange-950/60 text-orange-300 border-orange-800/80';

                      return (
                        <div key={lesson.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2 text-xs relative group shadow-lg">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wider ${badgeStyle}`}>
                                {lesson.lesson_type.replace('_', ' ')}
                              </span>
                              {!lesson.project_id && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-zinc-800 text-zinc-400 border border-zinc-700">
                                  Global
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-2">
                              <span className="px-2 py-0.5 bg-indigo-950/60 border border-indigo-800 text-indigo-300 rounded-full font-mono text-[10px] font-bold">
                                x{lesson.occurrence_count} {lesson.occurrence_count >= 3 ? '🔥 Repeated' : ''}
                              </span>
                              <button
                                onClick={() => handleDeleteLesson(lesson.id)}
                                title="Forget this lesson"
                                className="p-1 hover:bg-rose-900/40 text-zinc-500 hover:text-rose-400 rounded transition"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          <div>
                            <div className="font-semibold text-zinc-200 text-sm">
                              {lesson.trigger_summary}
                            </div>
                            <div className="mt-2 text-zinc-300 bg-zinc-950 p-3 rounded-lg border border-zinc-800/80 font-mono text-xs">
                              💡 <span className="text-indigo-400 font-semibold">Learned Fix / Rule:</span> {lesson.fix_or_rule}
                            </div>
                          </div>

                          <div className="text-[10px] text-zinc-600 font-mono text-right">
                            Updated: {new Date(lesson.updated_at).toLocaleString()}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* 6. BRAND & DESIGN SYSTEM MEMORY TAB */}
            {activeTab === 'brand' && (
              <div className="p-6 space-y-6 overflow-y-auto h-full max-w-2xl">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-bold text-white text-base">
                    <Palette className="w-5 h-5 text-pink-400" /> Brand & Design System Memory
                  </div>
                  <button
                    onClick={handleSaveBrandProfile}
                    disabled={isSavingBrand}
                    className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold text-xs rounded-xl shadow transition flex items-center gap-1.5"
                  >
                    <Check className="w-3.5 h-3.5" /> {isSavingBrand ? 'Saving...' : 'Save Brand Settings'}
                  </button>
                </div>

                <p className="text-xs text-zinc-400">
                  The agent strictly follows this design system when generating or updating pages across your entire project.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-zinc-900/80 p-4 rounded-xl border border-zinc-800">
                  <div>
                    <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block mb-1.5">
                      Primary Color
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={brandForm.primary_color}
                        onChange={(e) => setBrandForm({ ...brandForm, primary_color: e.target.value })}
                        className="w-8 h-8 rounded border-none bg-transparent cursor-pointer"
                      />
                      <input
                        type="text"
                        value={brandForm.primary_color}
                        onChange={(e) => setBrandForm({ ...brandForm, primary_color: e.target.value })}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1 text-xs text-zinc-200 font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block mb-1.5">
                      Secondary Color
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={brandForm.secondary_color}
                        onChange={(e) => setBrandForm({ ...brandForm, secondary_color: e.target.value })}
                        className="w-8 h-8 rounded border-none bg-transparent cursor-pointer"
                      />
                      <input
                        type="text"
                        value={brandForm.secondary_color}
                        onChange={(e) => setBrandForm({ ...brandForm, secondary_color: e.target.value })}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1 text-xs text-zinc-200 font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block mb-1.5">
                      Accent Color
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={brandForm.accent_color}
                        onChange={(e) => setBrandForm({ ...brandForm, accent_color: e.target.value })}
                        className="w-8 h-8 rounded border-none bg-transparent cursor-pointer"
                      />
                      <input
                        type="text"
                        value={brandForm.accent_color}
                        onChange={(e) => setBrandForm({ ...brandForm, accent_color: e.target.value })}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1 text-xs text-zinc-200 font-mono"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block mb-1.5">
                      Typography / Font Family
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Inter, Playfair Display, Outfit"
                      value={brandForm.font_family}
                      onChange={(e) => setBrandForm({ ...brandForm, font_family: e.target.value })}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-200"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block mb-1.5">
                      Brand Tone & Style
                    </label>
                    <select
                      value={brandForm.tone}
                      onChange={(e) => setBrandForm({ ...brandForm, tone: e.target.value })}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-200"
                    >
                      <option value="professional">Professional & Corporate</option>
                      <option value="minimal">Minimal & Clean</option>
                      <option value="playful">Playful & Vibrant</option>
                      <option value="luxury">Luxury & Premium</option>
                      <option value="bold">Bold & High Contrast</option>
                      <option value="modern">Modern & High-Tech</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block mb-1.5">
                    Logo Description & Concept
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Minimalist geometric rocket icon with gradient text"
                    value={brandForm.logo_description}
                    onChange={(e) => setBrandForm({ ...brandForm, logo_description: e.target.value })}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-200"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block mb-1.5">
                    Additional Brand Rules & Notes
                  </label>
                  <textarea
                    rows={3}
                    placeholder="e.g. Always use rounded buttons, include shadow on cards, maintain light mode canvas."
                    value={brandForm.additional_notes}
                    onChange={(e) => setBrandForm({ ...brandForm, additional_notes: e.target.value })}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-xs text-zinc-200"
                  />
                </div>
              </div>
            )}

            {/* 7. FORM SUBMISSIONS TAB */}
            {activeTab === 'submissions' && (
              <div className="p-6 space-y-4 overflow-y-auto h-full">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-bold text-white text-base">
                    <Inbox className="w-5 h-5 text-emerald-400" /> Form Submissions Inbox
                  </div>
                  <button
                    onClick={() => activeProjectId && loadFormSubmissions(activeProjectId)}
                    className="text-xs text-indigo-400 hover:underline flex items-center gap-1 font-mono"
                  >
                    <RefreshCw className={`w-3 h-3 ${isLoadingSubmissions ? 'animate-spin' : ''}`} /> Refresh
                  </button>
                </div>

                {formSubmissions.length === 0 ? (
                  <div className="text-sm text-zinc-500 p-8 text-center bg-zinc-900 border border-zinc-800 rounded-2xl space-y-2">
                    <Inbox className="w-8 h-8 text-zinc-600 mx-auto" />
                    <p className="font-semibold text-zinc-300">No form submissions received yet.</p>
                    <p className="text-xs text-zinc-500">When visitors submit contact or lead forms on your generated website, their messages will appear here in real time!</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {formSubmissions.map((sub) => (
                      <div key={sub.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2 text-xs shadow-lg">
                        <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800 uppercase tracking-wider">
                            {sub.form_name}
                          </span>
                          <span className="text-[10px] text-zinc-500 font-mono">
                            {new Date(sub.submitted_at).toLocaleString()}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 font-mono">
                          {Object.entries(sub.submitted_data || {}).map(([key, value]) => (
                            <div key={key} className="bg-zinc-950 p-2 rounded-lg border border-zinc-800/60">
                              <span className="text-indigo-400 font-semibold block capitalize text-[10px]">{key}:</span>
                              <span className="text-zinc-200 text-xs break-words">{String(value)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'spec' && (
              <div className="p-6 space-y-4 overflow-y-auto h-full">
                <div className="flex items-center gap-2 font-bold text-white text-base">
                  <ClipboardList className="w-5 h-5 text-sky-400" /> Requirement Spec
                </div>
                <p className="text-xs text-zinc-500">
                  Describe what you want in plain language. The agent turns it into a structured spec (goals, pages,
                  features, acceptance criteria) — approve it, then future builds follow it precisely.
                </p>

                <textarea
                  value={specRequirementDraft}
                  onChange={(e) => setSpecRequirementDraft(e.target.value)}
                  placeholder="e.g. A SaaS landing page for a project-management tool, with pricing, testimonials, and a signup form that emails me new leads..."
                  rows={4}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-sm text-zinc-200 focus:outline-none focus:border-sky-600 resize-none"
                />
                <button
                  onClick={handleGenerateSpec}
                  disabled={isGeneratingSpec || !specRequirementDraft.trim()}
                  className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold flex items-center gap-2"
                >
                  {isGeneratingSpec ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ClipboardList className="w-4 h-4" />}
                  Generate Spec
                </button>

                {activeSpec ? (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-4 text-xs mt-2">
                    <div className="flex items-center justify-between">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                          activeSpec.status === 'approved'
                            ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                            : 'bg-amber-950 text-amber-300 border-amber-800'
                        }`}
                      >
                        {activeSpec.status}
                      </span>
                      {activeSpec.status === 'draft' && (
                        <button
                          onClick={handleApproveSpec}
                          className="text-emerald-400 hover:underline flex items-center gap-1 font-semibold"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" /> Approve Spec
                        </button>
                      )}
                    </div>

                    {(() => {
                      let parsed: any = {};
                      try {
                        parsed = typeof activeSpec.structured_spec === 'string' ? JSON.parse(activeSpec.structured_spec) : activeSpec.structured_spec;
                      } catch {
                        parsed = {};
                      }
                      const section = (title: string, items: string[] | undefined, color: string) => (
                        <div>
                          <div className={`font-bold text-[10px] uppercase tracking-wider mb-1 ${color}`}>{title}</div>
                          <ul className="list-disc list-inside space-y-0.5 text-zinc-300">
                            {(items || []).map((item, i) => (
                              <li key={i}>{item}</li>
                            ))}
                          </ul>
                        </div>
                      );
                      return (
                        <div className="space-y-3">
                          {section('Goals', parsed.goals, 'text-sky-400')}
                          {section('Pages', parsed.pages, 'text-violet-400')}
                          {section('Features', parsed.features, 'text-emerald-400')}
                          {section('Constraints', parsed.constraints, 'text-amber-400')}
                          {section('Acceptance Criteria', parsed.acceptance_criteria, 'text-rose-400')}
                        </div>
                      );
                    })()}
                  </div>
                ) : (
                  <div className="text-sm text-zinc-500 p-8 text-center bg-zinc-900 border border-zinc-800 rounded-2xl">
                    No spec yet for this project. Describe your requirement above to generate one.
                  </div>
                )}
              </div>
            )}

            {activeTab === 'team' && (
              <div className="p-6 space-y-4 overflow-y-auto h-full">
                <div className="flex items-center gap-2 font-bold text-white text-base">
                  <Users className="w-5 h-5 text-violet-400" /> Team Members
                </div>
                <p className="text-xs text-zinc-500">
                  Invite collaborators to this project by their user ID. Editors can build/edit; viewers can only watch.
                </p>

                {myProjectRole === 'owner' && (
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      value={inviteUidDraft}
                      onChange={(e) => setInviteUidDraft(e.target.value)}
                      placeholder="Collaborator's user ID (uid)"
                      className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-violet-600"
                    />
                    <select
                      value={inviteRoleDraft}
                      onChange={(e) => setInviteRoleDraft(e.target.value as 'editor' | 'viewer')}
                      className="bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-200 focus:outline-none"
                    >
                      <option value="editor">Editor</option>
                      <option value="viewer">Viewer</option>
                    </select>
                    <button
                      onClick={handleInviteMember}
                      disabled={isInvitingMember || !inviteUidDraft.trim()}
                      className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-sm font-semibold whitespace-nowrap"
                    >
                      Invite
                    </button>
                  </div>
                )}

                {myProjectRole && myProjectRole !== 'owner' && (
                  <div className="text-xs text-zinc-500 bg-zinc-900 border border-zinc-800 rounded-xl p-3">
                    Your role on this project: <span className="text-violet-400 font-semibold">{myProjectRole}</span>. Only the owner can invite or remove members.
                  </div>
                )}

                <div className="space-y-2">
                  {projectMembers.length === 0 ? (
                    <div className="text-sm text-zinc-500 p-8 text-center bg-zinc-900 border border-zinc-800 rounded-2xl">
                      No collaborators yet — you're the only one on this project.
                    </div>
                  ) : (
                    projectMembers.map((m) => (
                      <div key={m.id} className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-xs">
                        <div>
                          <span className="text-zinc-200 font-mono">{m.user_id}</span>
                          <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-violet-950 text-violet-300 border border-violet-800">
                            {m.role}
                          </span>
                        </div>
                        {myProjectRole === 'owner' && (
                          <button onClick={() => handleRemoveMember(m.user_id)} className="text-rose-400 hover:underline flex items-center gap-1">
                            <Trash2 className="w-3.5 h-3.5" /> Remove
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {activeTab === 'prs' && (
              <div className="p-6 space-y-4 overflow-y-auto h-full">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-bold text-white text-base">
                    <GitPullRequest className="w-5 h-5 text-orange-400" /> Pull Requests
                  </div>
                  <button
                    onClick={() => activeProjectId && loadPullRequests(activeProjectId)}
                    className="text-xs text-indigo-400 hover:underline flex items-center gap-1 font-mono"
                  >
                    <RefreshCw className="w-3 h-3" /> Refresh
                  </button>
                </div>
                <p className="text-xs text-zinc-500">
                  When the agent classifies a change as "major", it opens a real Pull Request here (instead of committing
                  directly) so a human can review before merging.
                </p>

                {pullRequests.length === 0 ? (
                  <div className="text-sm text-zinc-500 p-8 text-center bg-zinc-900 border border-zinc-800 rounded-2xl">
                    No pull requests opened yet. They'll appear here automatically for significant changes.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {pullRequests.map((pr) => (
                      <a
                        key={pr.id}
                        href={pr.pr_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block bg-zinc-900 border border-zinc-800 hover:border-orange-700 rounded-xl p-4 space-y-1 text-xs transition"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-zinc-100 font-semibold flex items-center gap-1.5">
                            <GitPullRequest className="w-3.5 h-3.5 text-orange-400" /> #{pr.pr_number} {pr.title}
                          </span>
                          <ExternalLink className="w-3.5 h-3.5 text-zinc-500" />
                        </div>
                        <div className="text-zinc-500 font-mono">{pr.branch_name}</div>
                        <div className="text-[10px] text-zinc-600">{new Date(pr.created_at).toLocaleString()}</div>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      </div>

      {/* VISUAL CLICK-TO-EDIT TARGETED ELEMENT MODAL */}
      {showElementEditModal && selectedElementInfo && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2 text-indigo-400 font-bold text-sm">
                <MousePointerClick className="w-5 h-5" /> Targeted Element Edit
              </div>
              <button
                onClick={() => {
                  setShowElementEditModal(false);
                  setSelectedElementInfo(null);
                }}
                className="text-zinc-500 hover:text-white p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 bg-indigo-950 text-indigo-300 border border-indigo-800 font-mono rounded text-[11px] font-bold uppercase">
                  &lt;{selectedElementInfo.tagName}&gt;
                </span>
                <span className="text-zinc-400 font-mono truncate text-[11px]">
                  {selectedElementInfo.selector}
                </span>
              </div>

              {selectedElementInfo.outerHTML && (
                <div className="bg-zinc-950 p-2.5 rounded-lg border border-zinc-800 font-mono text-[11px] text-zinc-400 max-h-28 overflow-y-auto whitespace-pre-wrap">
                  {selectedElementInfo.outerHTML}
                </div>
              )}
            </div>

            <form onSubmit={handleElementEditSubmit} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-zinc-300 block mb-1">
                  How would you like to edit this element?
                </label>
                <input
                  type="text"
                  autoFocus
                  placeholder="e.g. Change text to 'Contact Us Today' and make background indigo"
                  value={elementEditPrompt}
                  onChange={(e) => setElementEditPrompt(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-xs text-zinc-100 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowElementEditModal(false);
                    setSelectedElementInfo(null);
                  }}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isEditingElement || !elementEditPrompt.trim()}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold rounded-xl shadow flex items-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  {isEditingElement ? 'Applying Targeted Edit...' : 'Apply Element Edit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SETTINGS MODAL */}
      {showSettingsModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-xl w-full p-6 space-y-6 shadow-2xl overflow-y-auto max-h-[90vh]">
            <div className="flex justify-between items-center border-b border-zinc-800 pb-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Settings className="w-5 h-5 text-indigo-400" /> Integration Settings (Isolated per User)
              </h3>
              <button onClick={() => setShowSettingsModal(false)} className="text-zinc-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* GitHub Settings */}
            <div className="space-y-3 bg-zinc-950 p-4 rounded-xl border border-zinc-800">
              <div className="flex items-center justify-between">
                <div className="font-semibold text-sm text-white flex items-center gap-2">
                  <Github className="w-4 h-4 text-emerald-400" /> GitHub Configuration
                </div>
                {testResults.github && (
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${testResults.github.connected ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'}`}>
                    {testResults.github.connected ? '✓ Connected' : '✗ Failed'}
                  </span>
                )}
              </div>
              <div>
                <label className="text-xs text-zinc-400">Personal Access Token (PAT)</label>
                <input
                  type="password"
                  value={settings.github_token}
                  onChange={(e) => setSettings({ ...settings, github_token: e.target.value })}
                  placeholder="ghp_xxxxxxxxxxxx"
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono mt-1"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-zinc-400">Owner/Username</label>
                  <input
                    type="text"
                    value={settings.github_owner}
                    onChange={(e) => setSettings({ ...settings, github_owner: cleanGithubField(e.target.value, 'owner') })}
                    placeholder="my-org-or-user"
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-indigo-500 mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-400">Repository Name</label>
                  <input
                    type="text"
                    value={settings.github_repo}
                    onChange={(e) => setSettings({ ...settings, github_repo: cleanGithubField(e.target.value, 'repo') })}
                    placeholder="my-website-repo"
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-indigo-500 mt-1"
                  />
                </div>
              </div>
              {testResults.github && (
                <p className={`text-[10px] ${testResults.github.connected ? 'text-emerald-400' : 'text-rose-400'}`}>{testResults.github.message}</p>
              )}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => handleConnectService('github')}
                  disabled={testingConnection === 'github' || !settings.github_token}
                  className="flex-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium rounded-lg transition"
                >
                  {testingConnection === 'github' ? 'Connecting...' : 'Connect GitHub'}
                </button>
                {settings.github_token && (
                  <button
                    onClick={() => handleDisconnectService('github')}
                    className="px-3 py-1.5 bg-zinc-800 hover:bg-rose-500/20 hover:text-rose-400 text-zinc-400 text-xs font-medium rounded-lg transition"
                  >
                    Disconnect
                  </button>
                )}
              </div>
            </div>

            {/* Vercel Settings */}
            <div className="space-y-3 bg-zinc-950 p-4 rounded-xl border border-zinc-800">
              <div className="flex items-center justify-between">
                <div className="font-semibold text-sm text-white flex items-center gap-2">
                  <Zap className="w-4 h-4 text-indigo-400" /> Vercel Configuration
                </div>
                {testResults.vercel && (
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${testResults.vercel.connected ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'}`}>
                    {testResults.vercel.connected ? '✓ Connected' : '✗ Failed'}
                  </span>
                )}
              </div>
              <div>
                <label className="text-xs text-zinc-400">Vercel API Token</label>
                <input
                  type="password"
                  value={settings.vercel_token}
                  onChange={(e) => setSettings({ ...settings, vercel_token: e.target.value })}
                  placeholder="Vercel Bearer Token"
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono mt-1"
                />
              </div>
              {testResults.vercel && (
                <p className={`text-[10px] ${testResults.vercel.connected ? 'text-emerald-400' : 'text-rose-400'}`}>{testResults.vercel.message}</p>
              )}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => handleConnectService('vercel')}
                  disabled={testingConnection === 'vercel' || !settings.vercel_token}
                  className="flex-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium rounded-lg transition"
                >
                  {testingConnection === 'vercel' ? 'Connecting...' : 'Connect Vercel'}
                </button>
                {settings.vercel_token && (
                  <button
                    onClick={() => handleDisconnectService('vercel')}
                    className="px-3 py-1.5 bg-zinc-800 hover:bg-rose-500/20 hover:text-rose-400 text-zinc-400 text-xs font-medium rounded-lg transition"
                  >
                    Disconnect
                  </button>
                )}
              </div>
            </div>

            {/* Firebase Settings */}
            <div className="space-y-3 bg-zinc-950 p-4 rounded-xl border border-zinc-800">
              <div className="flex items-center justify-between">
                <div className="font-semibold text-sm text-white flex items-center gap-2">
                  <Flame className="w-4 h-4 text-amber-400" /> Firebase Realtime DB Configuration
                </div>
                {testResults.firebase && (
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${testResults.firebase.connected ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'}`}>
                    {testResults.firebase.connected ? '✓ Connected' : '✗ Failed'}
                  </span>
                )}
              </div>
              <div>
                <label className="text-xs text-zinc-400">Database URL</label>
                <input
                  type="text"
                  value={settings.firebase_db_url}
                  onChange={(e) => setSettings({ ...settings, firebase_db_url: e.target.value })}
                  placeholder="https://my-db.firebaseio.com"
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono mt-1"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-400">Database Secret / Token (Optional)</label>
                <input
                  type="password"
                  value={settings.firebase_secret}
                  onChange={(e) => setSettings({ ...settings, firebase_secret: e.target.value })}
                  placeholder="Secret key"
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono mt-1"
                />
              </div>
              {testResults.firebase && (
                <p className={`text-[10px] ${testResults.firebase.connected ? 'text-emerald-400' : 'text-rose-400'}`}>{testResults.firebase.message}</p>
              )}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => handleConnectService('firebase')}
                  disabled={testingConnection === 'firebase' || !settings.firebase_db_url}
                  className="flex-1 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium rounded-lg transition"
                >
                  {testingConnection === 'firebase' ? 'Connecting...' : 'Connect Firebase'}
                </button>
                {settings.firebase_db_url && (
                  <button
                    onClick={() => handleDisconnectService('firebase')}
                    className="px-3 py-1.5 bg-zinc-800 hover:bg-rose-500/20 hover:text-rose-400 text-zinc-400 text-xs font-medium rounded-lg transition"
                  >
                    Disconnect
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-3 border-t border-zinc-800 pt-4">
              <div className="text-xs font-bold text-zinc-300 flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-cyan-400" /> AI Model
              </div>
              <div>
                <label className="text-xs text-zinc-400">Preferred Model</label>
                <select
                  value={settings.preferred_model || 'gemini'}
                  onChange={(e) => setSettings({ ...settings, preferred_model: e.target.value })}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-indigo-500 mt-1"
                >
                  <option value="gemini">Gemini (built-in, no key needed)</option>
                  <option value="claude">Claude (your own Anthropic API key)</option>
                </select>
              </div>
              {settings.preferred_model === 'claude' && (
                <div>
                  <label className="text-xs text-zinc-400">Anthropic API Key</label>
                  <input
                    type="password"
                    value={settings.anthropic_api_key || ''}
                    onChange={(e) => setSettings({ ...settings, anthropic_api_key: e.target.value })}
                    placeholder="sk-ant-..."
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono mt-1"
                  />
                  <p className="text-[10px] text-zinc-500 mt-1">
                    If this fails (invalid key, outage), generation automatically falls back to Gemini.
                  </p>
                </div>
              )}
            </div>

            <div className="flex justify-between items-center pt-2">
              <p className="text-[10px] text-zinc-500 max-w-[55%]">
                Tip: each integration above connects independently — you don't need to fill in all three.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowSettingsModal(false)}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-xs font-medium transition"
                >
                  Close
                </button>
                <button
                  onClick={handleSaveSettings}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-medium shadow transition"
                >
                  Save AI Model & Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* NEW PROJECT MODAL */}
      {showNewProjectModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <h3 className="text-lg font-bold text-white">Create New Website Project</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-zinc-400">Project Name</label>
                <input
                  type="text"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="e.g. Modern E-Commerce Portal"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 mt-1"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-400">Description</label>
                <textarea
                  value={newProjectDesc}
                  onChange={(e) => setNewProjectDesc(e.target.value)}
                  placeholder="Brief summary of what this website does..."
                  rows={2}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 mt-1"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setShowNewProjectModal(false)}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-xs font-medium transition"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateProject}
                disabled={!newProjectName.trim()}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-medium shadow transition disabled:opacity-50"
              >
                Create Project
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CUSTOM UID SWITCH MODAL */}
      {showUidModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-sm w-full p-6 space-y-4 shadow-2xl">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Cpu className="w-5 h-5 text-indigo-400" /> Multi-User Isolation
            </h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              This Website Builder tool supports embedded marketplace UIDs via <code className="text-indigo-300">?uid=USER_ID</code>. All projects, messages, and API tokens are completely isolated to this user ID.
            </p>
            <div>
              <label className="text-xs text-zinc-400">Active User ID (UID)</label>
              <input
                type="text"
                value={customUidInput || uid}
                onChange={(e) => setCustomUidInput(e.target.value)}
                placeholder="e.g. user_marketplace_101"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 mt-1 font-mono"
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setShowUidModal(false)}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-xs font-medium transition"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (customUidInput.trim()) {
                    setUid(customUidInput.trim());
                    setActiveProjectId('');
                  }
                  setShowUidModal(false);
                }}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-medium shadow transition"
              >
                Switch User
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
