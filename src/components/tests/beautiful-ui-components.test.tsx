import '@happy-dom/global-registrator/register.js';

import assert from 'node:assert/strict';
import { test } from 'node:test';

import ApprovalCard from '@/components/beautiful-ui/approval-card';
import ChatComposer from '@/components/beautiful-ui/chat-composer';
import CodeBlock from '@/components/beautiful-ui/code-block';
import ContextCards from '@/components/beautiful-ui/context-cards';
import DiffTable from '@/components/beautiful-ui/diff-table';
import FilterTable from '@/components/beautiful-ui/filter-table';
import FineTuneCard from '@/components/beautiful-ui/fine-tune-card';
import InsightCards from '@/components/beautiful-ui/insight-cards';
import LoadingState from '@/components/beautiful-ui/loading-state';
import PromptBar from '@/components/beautiful-ui/prompt-bar';
import RecommendationCard from '@/components/beautiful-ui/recommendation-card';
import RecordsTable from '@/components/beautiful-ui/records-table';
import SearchList from '@/components/beautiful-ui/search-list';
import SelectionActions from '@/components/beautiful-ui/selection-actions';
import SidebarNav from '@/components/beautiful-ui/sidebar-nav';
import StreamingText from '@/components/beautiful-ui/streaming-text';
import TaskRows from '@/components/beautiful-ui/task-rows';
import ThinkingState from '@/components/beautiful-ui/thinking-state';
import ToolChips from '@/components/beautiful-ui/tool-chips';

test('all Beautiful UI components load without the reference website', () => {
  const components = [
    ApprovalCard,
    ChatComposer,
    CodeBlock,
    ContextCards,
    DiffTable,
    FilterTable,
    FineTuneCard,
    InsightCards,
    LoadingState,
    PromptBar,
    RecommendationCard,
    RecordsTable,
    SearchList,
    SelectionActions,
    SidebarNav,
    StreamingText,
    TaskRows,
    ThinkingState,
    ToolChips,
  ];

  assert.equal(components.length, 19);
  assert.equal(components.every((component) => typeof component === 'function'), true);
});
