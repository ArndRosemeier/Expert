export interface Rating {
    score: number;
    goal: number;
    criterion: string;
    justification?: string;
}

export interface RatingsDisplayOptions {
    title?: string;
    showTimestamp?: boolean;
    timestamp?: Date;
    compact?: boolean;
    showGoalLine?: boolean;
    showJustification?: boolean;
}

export class RatingsRenderer {
    /**
     * Renders ratings HTML with comprehensive styling and features
     */
    static renderRatings(
        ratings: Rating[], 
        options: RatingsDisplayOptions = {}
    ): string {
        const {
            title = 'Quality Ratings',
            showTimestamp = false,
            timestamp,
            compact = false,
            showGoalLine = true,
            showJustification = true
        } = options;

        if (!ratings || ratings.length === 0) {
            return this.renderNoRatings(title, compact);
        }

        const maxScore = Math.max(...ratings.map(r => Math.max(r.score, r.goal)), 10);
        
        const ratingsHtml = ratings.map(rating => 
            this.renderRatingItem(rating, maxScore, { 
                compact, 
                showGoalLine, 
                showJustification 
            })
        ).join('');

        const containerClass = compact ? 'ratings-container-compact' : 'ratings-container';
        
        return `
            <div class="${containerClass}">
                <h4 class="ratings-title">${this.escapeHtml(title)}</h4>
                <div class="ratings-list">
                    ${ratingsHtml}
                </div>
                ${showTimestamp && timestamp ? this.renderTimestamp(timestamp, showGoalLine) : ''}
            </div>
        `;
    }

    private static renderRatingItem(
        rating: Rating, 
        maxScore: number, 
        options: { compact: boolean; showGoalLine: boolean; showJustification: boolean }
    ): string {
        const { compact, showGoalLine, showJustification } = options;
        const scorePercentage = (rating.score / maxScore) * 100;
        const goalPercentage = (rating.goal / maxScore) * 100;
        const metGoal = rating.score >= rating.goal;
        const statusColor = metGoal ? '#28a745' : '#dc3545';
        const statusIcon = metGoal ? '✓' : '✗';
        
        const barHeight = compact ? '16px' : '24px';
        const itemMargin = compact ? '0.5rem' : '1rem';
        
        return `
            <div class="rating-item" style="margin-bottom: ${itemMargin};">
                <div class="rating-header">
                    <div class="rating-criterion">${this.escapeHtml(rating.criterion)}</div>
                    <div class="rating-score-display">
                        <span class="rating-status" style="color: ${statusColor}; font-size: 1.1rem;">${statusIcon}</span>
                        <span class="rating-score" style="font-weight: 600; color: ${statusColor};">${rating.score}/${rating.goal}</span>
                    </div>
                </div>
                
                <div class="rating-progress" style="position: relative; background-color: #e9ecef; border-radius: 6px; height: ${barHeight}; overflow: hidden; margin: 0.5rem 0;">
                    ${showGoalLine ? `<div class="rating-goal-line" style="position: absolute; left: ${goalPercentage}%; top: 0; bottom: 0; width: 2px; background-color: #ffc107; z-index: 2;"></div>` : ''}
                    <div class="rating-bar" style="height: 100%; background: linear-gradient(90deg, ${metGoal ? '#28a745' : '#dc3545'} 0%, ${metGoal ? '#34ce57' : '#e74c3c'} 100%); width: ${scorePercentage}%; border-radius: 6px; transition: width 0.3s ease-in-out; position: relative;">
                        <div class="rating-shine" style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.2) 50%, transparent 100%); animation: progress-shine 2s infinite;"></div>
                    </div>
                </div>
                
                ${showJustification && rating.justification ? `
                    <div class="rating-justification">
                        "${this.escapeHtml(rating.justification)}"
                    </div>
                ` : ''}
            </div>
        `;
    }

    private static renderNoRatings(_title: string, compact: boolean): string {
        const containerClass = compact ? 'ratings-container-compact' : 'ratings-container';
        const padding = compact ? '1rem' : '2rem';
        
        return `
            <div class="${containerClass}">
                <div class="no-ratings" style="padding: ${padding}; text-align: center; color: #6c757d; background-color: #f8f9fa; border-radius: 8px; border: 1px solid #e9ecef;">
                    <h4 style="margin: 0 0 0.5rem 0; color: #495057;">No Ratings Available</h4>
                    <p style="margin: 0; font-size: 0.9rem;">This content doesn't have any quality ratings yet.</p>
                </div>
            </div>
        `;
    }

    private static renderTimestamp(timestamp: Date, showGoalLine: boolean): string {
        return `
            <div class="ratings-footer">
                ${showGoalLine ? `
                    <div class="ratings-legend">
                        <div style="width: 12px; height: 2px; background-color: #ffc107;"></div>
                        <span>Goal threshold</span>
                    </div>
                ` : ''}
                <div class="ratings-timestamp">Generated: ${timestamp.toLocaleString()}</div>
            </div>
        `;
    }

    private static escapeHtml(text: string): string {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Gets the CSS styles needed for ratings rendering
     */
    static getStyles(): string {
        return `
            .ratings-container {
                padding: 1.5rem;
                background-color: #f8f9fa;
                border-radius: 8px;
                border: 1px solid #e9ecef;
            }

            .ratings-container-compact {
                padding: 1rem;
                background-color: #f8f9fa;
                border-radius: 6px;
                border: 1px solid #e9ecef;
            }

            .ratings-title {
                margin: 0 0 1rem 0;
                color: #495057;
                font-size: 1.1rem;
                font-weight: 600;
            }

            .ratings-list {
                display: flex;
                flex-direction: column;
                gap: 0.5rem;
            }

            .rating-item {
                background: white;
                padding: 0.75rem;
                border-radius: 6px;
                border: 1px solid #e9ecef;
            }

            .rating-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 0.5rem;
            }

            .rating-criterion {
                font-weight: 600;
                color: #343a40;
            }

            .rating-score-display {
                display: flex;
                align-items: center;
                gap: 0.5rem;
            }

            .rating-justification {
                margin-top: 0.5rem;
                font-size: 0.85rem;
                color: #6c757d;
                font-style: italic;
                padding: 0.5rem;
                background-color: #f8f9fa;
                border-radius: 4px;
                border-left: 3px solid #dee2e6;
            }

            .ratings-footer {
                margin-top: 1rem;
                padding-top: 1rem;
                border-top: 1px solid #dee2e6;
                font-size: 0.8rem;
                color: #6c757d;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }

            .ratings-legend {
                display: flex;
                align-items: center;
                gap: 0.5rem;
            }

            @keyframes progress-shine {
                0% { transform: translateX(-100%); }
                100% { transform: translateX(100%); }
            }

            /* Compact mode adjustments */
            .ratings-container-compact .ratings-title {
                font-size: 1rem;
                margin-bottom: 0.75rem;
            }

            .ratings-container-compact .rating-item {
                padding: 0.5rem;
            }

            .ratings-container-compact .rating-justification {
                font-size: 0.8rem;
                padding: 0.4rem;
            }
        `;
    }
} 