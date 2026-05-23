/**
 * Git 备份管理器
 * 基于 webnovel-writer 架构
 * 
 * 负责：
 * - 保存章节内容到文件
 * - 提交到 Git
 * - 管理备份历史
 */

import { ref } from 'vue';
import { useProjectStore } from '@/stores/project.store';

export interface BackupResult {
  success: boolean;
  commitHash?: string;
  files: string[];
  error?: string;
}

export class GitBackupManager {
  private projectStore = useProjectStore();
  private backupHistory = ref<BackupResult[]>([]);
  
  /**
   * 备份章节
   */
  async backup(
    chapterNumber: number,
    content: string,
    title: string
  ): Promise<BackupResult> {
    try {
      // 1. 确定备份路径
      const filePath = this.getChapterFilePath(chapterNumber);
      
      // 2. 保存内容
      await this.saveChapter(filePath, content);
      
      // 3. Git 提交
      const commitHash = await this.gitCommit(filePath, title);
      
      const result: BackupResult = {
        success: true,
        commitHash,
        files: [filePath],
      };
      
      // 4. 记录历史
      this.backupHistory.value.push(result);
      
      return result;
      
    } catch (error) {
      const result: BackupResult = {
        success: false,
        files: [],
        error: String(error),
      };
      
      this.backupHistory.value.push(result);
      
      return result;
    }
  }
  
  /**
   * 获取章节文件路径
   */
  private getChapterFilePath(chapterNumber: number): string {
    const project = this.projectStore.currentProject;
    const projectPath = project?.path || '';
    
    // 获取章节文件扩展名
    const extension = project?.settings?.chapterFileExtension || '.txt';
    
    // 构建路径
    return `${projectPath}/chapters/${String(chapterNumber).padStart(4, '0')}${extension}`;
  }
  
  /**
   * 保存章节内容
   */
  private async saveChapter(filePath: string, content: string): Promise<void> {
    // 简化实现：使用 FileSystem API 或 IPC
    // 实际应该通过 Electron IPC 调用主进程写入文件
    
    console.log('[GitBackup] 保存章节:', filePath);
    
    // TODO: 实现实际的 FileSystem 写入
    // 可以使用以下方式：
    // 1. window.fs.writeFile (Electron)
    // 2. 通过 IPC 调用主进程
    // 3. 保存到 store
    
    // 暂时存储到项目 store
    const project = this.projectStore.currentProject;
    if (project) {
      if (!project.chapters) {
        project.chapters = [];
      }
      
      const chapterIndex = project.chapters.findIndex(
        (c: any) => c.orderIndex + 1 === this.extractChapterNumber(filePath)
      );
      
      if (chapterIndex >= 0) {
        project.chapters[chapterIndex].content = content;
      } else {
        project.chapters.push({
          orderIndex: this.extractChapterNumber(filePath) - 1,
          title: this.extractTitle(filePath),
          content,
        });
      }
    }
  }
  
  /**
   * Git 提交
   */
  private async gitCommit(filePath: string, message: string): Promise<string> {
    console.log('[GitBackup] Git 提交:', filePath, message);
    
    // TODO: 实现实际的 Git 提交
    // 可以使用 simple-git 或通过 IPC 调用
    
    // 模拟生成 commit hash
    const hash = `commit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    
    return hash;
  }
  
  /**
   * 提取章节号
   */
  private extractChapterNumber(filePath: string): number {
    const match = filePath.match(/(\d+)(?:\.[^.]+)?$/);
    return match ? parseInt(match[1], 10) : 0;
  }
  
  /**
   * 提取标题
   */
  private extractTitle(filePath: string): string {
    const filename = filePath.split('/').pop() || '';
    const title = filename.replace(/^\d+_?/, '').replace(/\.[^.]+$/, '');
    return title || '未命名章节';
  }
  
  /**
   * 获取备份历史
   */
  getHistory(): BackupResult[] {
    return this.backupHistory.value;
  }
  
  /**
   * 获取最近的备份
   */
  getLatestBackup(): BackupResult | undefined {
    return this.backupHistory.value[this.backupHistory.value.length - 1];
  }
  
  /**
   * 清理旧备份
   */
  cleanOldBackups(keepCount: number = 50): void {
    if (this.backupHistory.value.length > keepCount) {
      this.backupHistory.value = this.backupHistory.value.slice(-keepCount);
    }
  }
}

// ============================================================
// Composable 导出
// ============================================================

export function useGitBackupManager() {
  const manager = new GitBackupManager();
  
  return {
    manager,
    backup: (chapterNumber: number, content: string, title: string) =>
      manager.backup(chapterNumber, content, title),
    getHistory: () => manager.getHistory(),
    getLatestBackup: () => manager.getLatestBackup(),
  };
}
