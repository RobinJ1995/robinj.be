// Single source of truth for the site's content. Both the editorial and the
// terminal/IDE views are driven from this object; each section lives in its own file.
import profile from './profile';
import work from './work';
import sideQuests from './side-quests';
import volunteering from './volunteering';
import education from './education';
import languages from './languages';

export const CONTENT = Object.freeze({
	...profile,
	work,
	projects: sideQuests,
	volunteering,
	education,
	languages,
});
