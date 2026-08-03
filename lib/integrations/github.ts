// Real GitHub REST API integration

export interface GitHubCommitResult {
  success: boolean;
  commitSha?: string;
  commitUrl?: string;
  error?: string;
  pushedFilesCount?: number;
}

export async function testGitHubToken(token: string): Promise<{ success: boolean; username?: string; error?: string }> {
  try {
    const res = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `token ${token}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'WebsiteBuilderAgent',
      },
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      return { success: false, error: errData.message || `GitHub HTTP ${res.status}` };
    }

    const data = await res.json();
    return { success: true, username: data.login };
  } catch (err: any) {
    return { success: false, error: err.message || 'Network error connecting to GitHub' };
  }
}

export interface PullRequestResult {
  success: boolean;
  prUrl?: string;
  prNumber?: number;
  branchName?: string;
  error?: string;
}

// Creates a new branch (from the repo's default branch tip), commits the
// given files onto it, and opens a real Pull Request. This is the
// "autonomous PR" path — used when the agent decides a change is
// significant enough to review before merging, instead of committing
// straight to main.
export async function pushToGitHubViaPullRequest(
  token: string,
  owner: string,
  repo: string,
  files: Record<string, string>,
  prTitle: string,
  prDescription: string
): Promise<PullRequestResult> {
  if (!token || !owner || !repo) {
    return { success: false, error: 'GitHub Personal Access Token, Owner, and Repository name are required.' };
  }

  const headers = {
    Authorization: `token ${token}`,
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'WebsiteBuilderAgent',
  };

  try {
    // 1. Find the default branch and its latest commit SHA
    const repoRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers });
    if (!repoRes.ok) {
      const err = await repoRes.json().catch(() => ({}));
      return { success: false, error: err.message || `Could not read repo (${repoRes.status})` };
    }
    const repoData = await repoRes.json();
    const defaultBranch = repoData.default_branch || 'main';

    const refRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${defaultBranch}`, { headers });
    if (!refRes.ok) {
      const err = await refRes.json().catch(() => ({}));
      return { success: false, error: err.message || `Could not read default branch ref (${refRes.status})` };
    }
    const refData = await refRes.json();
    const baseSha = refData.object.sha;

    // 2. Create a new branch pointing at that same commit
    const branchName = `agent/${Date.now()}`;
    const createRefRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/refs`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref: `refs/heads/${branchName}`, sha: baseSha }),
    });
    if (!createRefRes.ok) {
      const err = await createRefRes.json().catch(() => ({}));
      return { success: false, error: err.message || `Could not create branch (${createRefRes.status})` };
    }

    // 3. Commit the changed files onto the new branch (reuses the same
    //    create-or-update-file Contents API logic as a direct push)
    const commitResult = await pushToGitHub(token, owner, repo, files, prTitle, branchName);
    if (!commitResult.success) {
      return { success: false, error: commitResult.error || 'Failed to commit files to the new branch' };
    }

    // 4. Open the Pull Request
    const prRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: prTitle,
        head: branchName,
        base: defaultBranch,
        body: prDescription,
      }),
    });
    if (!prRes.ok) {
      const err = await prRes.json().catch(() => ({}));
      return { success: false, error: err.message || `Could not open pull request (${prRes.status})` };
    }
    const prData = await prRes.json();

    return {
      success: true,
      prUrl: prData.html_url,
      prNumber: prData.number,
      branchName,
    };
  } catch (err: any) {
    return { success: false, error: err.message || 'Pull request automation exception occurred' };
  }
}

export async function pushToGitHub(
  token: string,
  owner: string,
  repo: string,
  files: Record<string, string>,
  commitMessage = 'Update website files via Website Builder Agent',
  branch = 'main'
): Promise<GitHubCommitResult> {
  if (!token || !owner || !repo) {
    return { success: false, error: 'GitHub Personal Access Token, Owner, and Repository name are required.' };
  }

  try {
    const fileKeys = Object.keys(files);
    if (fileKeys.length === 0) {
      return { success: false, error: 'No files provided to push.' };
    }

    let successCount = 0;
    let lastCommitSha = '';

    for (const filePath of fileKeys) {
      const cleanPath = filePath.replace(/^\/+/, '');
      const content = files[filePath];
      const encodedContent = Buffer.from(content).toString('base64');

      // Check if file exists to get sha for update
      const getUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(cleanPath)}?ref=${branch}`;
      const getRes = await fetch(getUrl, {
        headers: {
          Authorization: `token ${token}`,
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'WebsiteBuilderAgent',
        },
      });

      let sha: string | undefined = undefined;
      if (getRes.ok) {
        const fileInfo = await getRes.json();
        sha = fileInfo.sha;
      }

      // Create or update file
      const putUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(cleanPath)}`;
      const putBody: any = {
        message: `${commitMessage}: ${cleanPath}`,
        content: encodedContent,
        branch,
      };
      if (sha) {
        putBody.sha = sha;
      }

      const putRes = await fetch(putUrl, {
        method: 'PUT',
        headers: {
          Authorization: `token ${token}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
          'User-Agent': 'WebsiteBuilderAgent',
        },
        body: JSON.stringify(putBody),
      });

      if (putRes.ok) {
        const putData = await putRes.json();
        successCount++;
        lastCommitSha = putData.commit?.sha || '';
      } else {
        const errData = await putRes.json().catch(() => ({}));
        console.warn(`Failed to push file ${cleanPath}:`, errData);
      }
    }

    if (successCount === 0) {
      return { success: false, error: 'Failed to push any files to GitHub. Verify repository exists and token has `repo` write scope.' };
    }

    return {
      success: true,
      commitSha: lastCommitSha,
      commitUrl: `https://github.com/${owner}/${repo}/commit/${lastCommitSha}`,
      pushedFilesCount: successCount,
    };
  } catch (err: any) {
    return { success: false, error: err.message || 'GitHub commit exception occurred' };
  }
}
