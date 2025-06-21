import { getElementById, mainAppContainer } from './dom-elements';
import * as state from '../state';
import { LoopInput, QualityCriterion, Rating, LoopHistoryItem } from '../LoopOrchestrator';
import { CreatorPayload, EditorPayload, RatingPayload } from '../types';

function handleStartLoop() {
    const orchestrator = state.getOrchestrator();
    if (!orchestrator) {
        alert('Please configure models first.');
        return;
    }

    state.setLoopHistory([]);
    state.setViewedIteration(0);
    getElementById<HTMLDivElement>('history-controls').style.display = 'none';

    const promptEl = getElementById<HTMLTextAreaElement>('prompt');
    
    // This is a temporary solution. In the final refactoring, 
    // the criteria will be managed within the settings modal, not the main UI.
    const criteria: QualityCriterion[] = []; // Placeholder

    if (!promptEl.value.trim()) {
        alert('Please enter a prompt before starting the loop.');
        return;
    }

    const loopInput: LoopInput = {
        prompt: promptEl.value,
        criteria: criteria,
        maxIterations: 5, // Placeholder
    };

    const startBtn = getElementById<HTMLButtonElement>('start-loop-btn');
    const stopBtn = getElementById<HTMLButtonElement>('stop-loop-btn');

    startBtn.style.display = 'none';
    stopBtn.style.display = 'inline-block';

    // Reset and show progress bars
    const progressContainer = getElementById<HTMLDivElement>('progress-container');
    const iterationProgressBar = getElementById<HTMLDivElement>('iteration-progress-bar');
    const stepProgressBar = getElementById<HTMLDivElement>('step-progress-bar');
    progressContainer.style.display = 'block';
    iterationProgressBar.style.width = '0%';
    iterationProgressBar.textContent = 'Starting...';
    stepProgressBar.style.width = '0%';
    stepProgressBar.textContent = '';

    // Clear previous results and show containers
    const resultsContainer = getElementById<HTMLElement>('results-container');
    const finalResultContainer = getElementById<HTMLElement>('final-result-container');

    // Hide all sub-containers initially
    (Array.from(resultsContainer.children) as HTMLElement[]).forEach(c => (c as HTMLElement).style.display = 'none');
    
    finalResultContainer.style.display = 'block';
    finalResultContainer.innerHTML = 'Looping...';
    
    orchestrator.runLoop(loopInput).then(result => {
        finalResultContainer.style.display = 'none'; // Hide the "Looping..." message
        
        state.setLoopHistory(result.history);
        const totalIterations = result.iterations;

        if (totalIterations > 0) {
            let iterationToShow = totalIterations;
            if (!result.success) {
                iterationToShow = findBestFailedIteration(state.getLoopHistory());
                console.log(`Loop failed. Showing best iteration: ${iterationToShow}`);
            }

            const historyControls = getElementById<HTMLDivElement>('history-controls');
            const iterSlider = getElementById<HTMLInputElement>('iteration-slider');
            
            historyControls.style.display = 'block';
            iterSlider.max = String(totalIterations);
            iterSlider.value = String(iterationToShow);
            state.setViewedIteration(iterationToShow);
            renderDataForIteration(state.getViewedIteration());
        } else {
            finalResultContainer.style.display = 'block';
            finalResultContainer.innerHTML = '<p>The loop did not run any iterations.</p>';
        }

    }).catch(error => {
        finalResultContainer.style.display = 'block';
        finalResultContainer.innerHTML = `<p style="color: red;">Error: ${error}</p>`;
        console.error(error);
    }).finally(() => {
        startBtn.style.display = 'inline-block';
        stopBtn.style.display = 'none';
        getElementById<HTMLDivElement>('progress-container').style.display = 'none';
    });
}


export function renderLoopUI() {
    mainAppContainer.innerHTML = `
        <style>
            .grid-container {
                display: grid;
                grid-template-columns: 1fr 2fr;
                gap: 2rem;
            }
            .control-panel {
                background-color: white;
                padding: 1.5rem;
                border-radius: 12px;
                box-shadow: 0 1px 3px 0 rgba(0,0,0,0.1), 0 1px 2px 0 rgba(0,0,0,0.06);
            }
            .results-panel {
                background-color: transparent;
            }
            h2, h3 {
                font-weight: 600;
                color: #111827;
                margin-top: 0;
            }
            h2 { font-size: 1.5rem; border-bottom: 1px solid var(--border-color); padding-bottom: 0.75rem; margin-bottom: 1.5rem; }
            h3 { font-size: 1.125rem; margin-bottom: 1rem; }
            label {
                font-weight: 500;
                margin-bottom: 0.5rem;
                display: block;
            }
            input[type="text"], input[type="number"], textarea, select {
                width: 100%;
                padding: 0.75rem;
                border: 1px solid var(--border-color);
                border-radius: 8px;
                background-color: var(--input-bg);
                transition: border-color 0.2s, box-shadow 0.2s;
                box-sizing: border-box;
            }
            input[type="text"]:focus, input[type="number"]:focus, textarea:focus, select:focus {
                outline: none;
                border-color: var(--primary-color);
                box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.2);
            }
            textarea#prompt {
                min-height: 150px;
                resize: vertical;
            }
            .response-block {
                padding: 1.5rem;
                border-radius: 12px;
                margin-top: 1rem;
                border: 1px solid;
                box-shadow: 0 1px 2px 0 rgba(0,0,0,0.05);
            }
            .response-block h3 { margin-top: 0; }
            .response-block pre { white-space: pre-wrap; word-break: break-all; background-color: var(--bg-subtle); padding: 1rem; border-radius: 8px; }
            .response-creator { background-color: #eff6ff; border-color: #bfdbfe; }
            .response-rater { background-color: #fefce8; border-color: #fde68a; }
            .response-editor { background-color: #faf5ff; border-color: #e9d5ff; }
            #final-result-container { margin-top: 1rem; }
            #history-controls {
                display: none; /* Hidden by default */
                padding: 1rem;
                background-color: var(--bg-subtle);
                border-radius: 12px;
                margin-top: 1rem;
                border: 1px solid var(--border-color);
            }
            #history-controls label {
                font-weight: 500;
                margin-right: 1rem;
            }
            #history-controls input[type="range"] {
                width: 200px;
                vertical-align: middle;
            }
            .progress-container {
                margin-top: 1rem;
                display: none; /* Hidden by default */
            }
            .progress-bar-wrapper {
                background-color: var(--bg-subtle);
                border-radius: 8px;
                padding: 3px;
                margin-bottom: 0.5rem;
            }
            .progress-bar {
                background-color: var(--primary-color);
                height: 20px;
                border-radius: 6px;
                transition: width 0.3s ease-in-out;
                text-align: center;
                color: white;
                font-size: 0.8rem;
                line-height: 20px;
                font-weight: 500;
            }
            .rating-list { list-style: none; padding: 0; margin: 0; }
            .rating-item { padding: 1rem 0; border-bottom: 1px solid var(--border-color); }
            .rating-item:first-child { padding-top: 0; }
            .rating-item:last-child { border-bottom: none; padding-bottom: 0; }
            .rating-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; }
            .rating-name { font-weight: 600; color: #374151; }
            .rating-score { font-weight: 700; font-size: 1.25rem; }
            .rating-reasoning { margin: 0; color: var(--secondary-color); font-size: 0.875rem; }
        </style>
        
        <div class="grid-container">
            <div class="control-panel">
                <h2>Controls</h2>
                <div>
                    <label for="prompt">Your Prompt:</label>
                    <textarea id="prompt" placeholder="Enter the high-level goal for your text..."></textarea>
                </div>
                <hr>
                <button id="start-loop-btn" class="button button-primary" style="width: 100%;">Start Loop</button>
                <button id="stop-loop-btn" class="button button-primary" style="display: none; width: 100%; background-color: #dc2626;">Stop Loop</button>
                <div id="progress-container" class="progress-container">
                    <div class="progress-bar-wrapper">
                        <div id="iteration-progress-bar" class="progress-bar" style="width: 0%;"></div>
                    </div>
                    <div class="progress-bar-wrapper">
                        <div id="step-progress-bar" class="progress-bar" style="width: 0%;"></div>
                    </div>
                </div>
            </div>
            
            <div class="results-panel">
                <div id="history-controls">
                    <label for="iteration-slider">View Iteration:</label>
                    <span id="iteration-label">1 / 1</span>
                    <input type="range" id="iteration-slider" min="1" max="1" value="1">
                </div>
                <div id="results-container">
                    <div id="live-response-container" class="response-block response-creator" style="display: none;">
                        <h3>Live Response</h3>
                        <p id="live-response"></p>
                    </div>
                    <div id="ratings-container" class="response-block response-rater" style="display: none;">
                        <h3>Latest Ratings</h3>
                        <div id="ratings"></div>
                    </div>
                    <div id="editor-advice-container" class="response-block response-editor" style="display: none;">
                        <h3>Editor's Advice</h3>
                        <p id="editor-advice"></p>
                    </div>
                    <div id="final-result-container"></div>
                </div>
            </div>
        </div>
    `;

    document.getElementById('start-loop-btn')?.addEventListener('click', handleStartLoop);
    document.getElementById('stop-loop-btn')?.addEventListener('click', () => {
        const orchestrator = state.getOrchestrator();
        if (orchestrator) {
            orchestrator.requestStop();
        }
    });

    const iterSlider = getElementById<HTMLInputElement>('iteration-slider');
    iterSlider.addEventListener('input', (e) => {
        const iteration = parseInt((e.target as HTMLInputElement).value, 10);
        state.setViewedIteration(iteration);
        renderDataForIteration(iteration);
    });
}

function getShortCriterionName(fullName: string): string {
    return fullName.split('.')[0];
}

function getRatingColor(rating: number): string {
    const hue = (rating / 10) * 120; // 0=red, 10=green
    return `hsl(${hue}, 70%, 50%)`;
}

function renderRatings(ratings: Rating[]): string {
    if (!ratings) {
        return '<p>No ratings available.</p>';
    }

    return `
        <ul class="rating-list">
            ${ratings.map(r => `
                <li class="rating-item">
                    <div class="rating-header">
                        <span class="rating-name">${getShortCriterionName(r.criterion)} (Goal: ${r.goal})</span>
                        <span class="rating-score" style="color: ${getRatingColor(r.score)}">${r.score}/10</span>
                    </div>
                    <p class="rating-reasoning">${r.justification}</p>
                </li>
            `).join('')}
        </ul>
    `;
}

function findBestFailedIteration(history: LoopHistoryItem[]): number {
    let bestIteration = -1;
    let highestScore = -1;

    // Get unique iteration numbers that have ratings
    const ratedIterations = [...new Set(history.filter(h => h.type === 'rating').map(h => h.iteration))];

    for (const iter of ratedIterations) {
        // Find the rating payload for this iteration
        const ratingItem = history.find(h => h.iteration === iter && h.type === 'rating');
        if (!ratingItem) continue;

        const ratings = (ratingItem.payload as RatingPayload).ratings;
        const totalScore = ratings.reduce((acc, r) => acc + r.score, 0);

        // Check if any goal was missed in this iteration
        const success = ratings.every(r => r.score >= r.goal);

        if (!success && totalScore > highestScore) {
            highestScore = totalScore;
            bestIteration = iter;
        }
    }
    
    // Fallback to the last iteration if no failed one is clearly "best"
    return bestIteration > 0 ? bestIteration : ratedIterations.pop() || 1;
}

function renderDataForIteration(iteration: number) {
    const loopHistory = state.getLoopHistory();
    if (loopHistory.length === 0) return;

    const historyForIter = loopHistory.filter(h => h.iteration === iteration);

    const creatorUpdate = historyForIter.find(h => h.type === 'creator');
    const ratingUpdate = historyForIter.find(h => h.type === 'rating');
    const editorUpdate = historyForIter.find(h => h.type === 'editor');

    const creatorContainer = getElementById<HTMLDivElement>('live-response-container');
    const ratingsContainer = getElementById<HTMLDivElement>('ratings-container');
    const editorContainer = getElementById<HTMLDivElement>('editor-advice-container');
    
    const creatorContent = getElementById<HTMLParagraphElement>('live-response');
    const ratingsContent = getElementById<HTMLDivElement>('ratings');
    const editorContent = getElementById<HTMLParagraphElement>('editor-advice');

    if (creatorUpdate) {
        creatorContainer.style.display = 'block';
        creatorContent.innerHTML = (creatorUpdate.payload as CreatorPayload).response.replace(/\n/g, '<br>');
    } else {
        creatorContainer.style.display = 'none';
    }

    if (ratingUpdate) {
        ratingsContainer.style.display = 'block';
        ratingsContent.innerHTML = renderRatings((ratingUpdate.payload as RatingPayload).ratings);
    } else {
        ratingsContainer.style.display = 'none';
    }

    if (editorUpdate) {
        editorContainer.style.display = 'block';
        editorContent.innerHTML = (editorUpdate.payload as EditorPayload).advice.replace(/\n/g, '<br>');
    } else {
        editorContainer.style.display = 'none';
    }
    
    // Update slider label
    const iterLabel = getElementById<HTMLSpanElement>('iteration-label');
    const iterSlider = getElementById<HTMLInputElement>('iteration-slider');
    iterLabel.textContent = `${iteration} / ${iterSlider.max}`;
} 