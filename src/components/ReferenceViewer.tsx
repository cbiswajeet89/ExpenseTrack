/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { referenceTemplates } from '../lib/referenceTemplates.js';
import { FileCode, Download, Copy, Check } from 'lucide-react';

export default function ReferenceViewer() {
  const [activeTab, setActiveTab] = useState<'compose' | 'backDocker' | 'frontDocker' | 'schema' | 'controller' | 'service'>('compose');
  const [copied, setCopied] = useState(false);

  const tabs = [
    { id: 'compose' as const, label: 'docker-compose.yml', content: referenceTemplates.dockerCompose, filename: 'docker-compose.yml' },
    { id: 'backDocker' as const, label: 'Backend Dockerfile', content: referenceTemplates.backendDockerfile, filename: 'backend.Dockerfile' },
    { id: 'frontDocker' as const, label: 'Frontend Dockerfile', content: referenceTemplates.frontendDockerfile, filename: 'frontend.Dockerfile' },
    { id: 'schema' as const, label: 'MySQL Schema (schema.sql)', content: referenceTemplates.mysqlSchema, filename: 'schema.sql' },
    { id: 'controller' as const, label: 'Spring Boot Controller', content: referenceTemplates.springController, filename: 'ExpenseController.java' },
    { id: 'service' as const, label: 'Angular API Service', content: referenceTemplates.angularService, filename: 'expense.service.ts' }
  ];

  const activeContent = tabs.find(t => t.id === activeTab)!;

  const handleCopy = () => {
    navigator.clipboard.writeText(activeContent.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const element = document.createElement("a");
    const file = new Blob([activeContent.content], {type: 'text/plain'});
    element.href = URL.createObjectURL(file);
    element.download = activeContent.filename;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  return (
    <div className="space-y-6 font-sans">
      <div className="bg-white border border-gray-100 p-6 rounded-2xl shadow-sm">
        <h2 className="text-xl font-semibold text-gray-900 tracking-tight flex items-center gap-2">
          <FileCode className="w-5.5 h-5.5 text-gray-500" /> Production Tech Stack Export
        </h2>
        <p className="text-xs text-gray-400 mt-1">
          Review, copy, or download reference code configured for containerization and deployment to Render or Cloud Run.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Left column: Tab triggers */}
        <div className="space-y-1 md:col-span-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); setCopied(false); }}
              className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-medium transition ${
                activeTab === tab.id
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-white hover:bg-gray-50 text-gray-700 border border-transparent'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Right column: Pre blocks */}
        <div className="md:col-span-3 bg-gray-900 rounded-2xl border border-gray-800 flex flex-col overflow-hidden">
          <div className="bg-gray-800 px-6 py-3 flex items-center justify-between border-b border-gray-750">
            <span className="text-[11px] font-mono font-semibold text-gray-400">
              {activeContent.filename}
            </span>

            <div className="flex gap-2">
              <button
                onClick={handleCopy}
                className="inline-flex items-center gap-1 bg-gray-700 hover:bg-gray-650 text-gray-300 text-xs px-2.5 py-1.5 rounded-lg transition"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
              <button
                onClick={handleDownload}
                className="inline-flex items-center gap-1 bg-indigo-600 hover:bg-indigo-700 text-white text-xs px-2.5 py-1.5 rounded-lg transition shadow-md shadow-indigo-600/10"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download</span>
              </button>
            </div>
          </div>

          <div className="p-6 max-h-[500px] overflow-y-auto">
            <pre className="text-xs font-mono text-gray-300 leading-relaxed whitespace-pre font-medium overflow-x-auto select-text">
              <code>{activeContent.content}</code>
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
