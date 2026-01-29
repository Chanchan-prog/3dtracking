import { AuthContext, AuthProvider } from "./context/AuthContext.jsx";
import Navbar from "./components/Navbar.jsx";
import AttendancePage from "./pages/Attendance/Index.jsx";
import AttedanceManagement from "./pages/AttedanceManagement/Index.jsx";
import DashboardPage from "./pages/Dashboard/Index.jsx";
import LoginPage from "./pages/Login/Index.jsx";
import BuildingIndex from "./pages/Building/Index.jsx";
import ThreeDBuildingIndex from "./pages/ThreeDBuilding/Index.jsx";
import RoomIndex from "./pages/Room/Index.jsx";
import UserIndex from "./pages/User/Index.jsx";
import ProgramIndex from "./pages/Program/Index.jsx";
import DepartmentIndex from "./pages/Department/Index.jsx";
import FloorIndex from "./pages/Floor/Index.jsx";
import SectionIndex from "./pages/Section/Index.jsx";
import SubjectIndex from "./pages/Subject/Index.jsx";
import ClassScheduleIndex from "./pages/ClassSchedule/Index.jsx";
import SemesterIndex from "./pages/Semester/Index.jsx";
import SubjectOfferingIndex from "./pages/SubjectOffering/Index.jsx";

function App(){
	const [route, setRoute] = React.useState(window.location.hash.slice(1) || '/login');
	React.useEffect(()=>{ const onhash = ()=> setRoute(window.location.hash.slice(1) || '/login'); window.addEventListener('hashchange', onhash); return ()=> window.removeEventListener('hashchange', onhash); }, []);

	// get current user from AuthContext to enforce role-based routing
	const auth = React.useContext(typeof AuthContext !== 'undefined' ? AuthContext : null) || {};
	const user = auth.user || null;

	// Redirect teachers (role_id === 5) away from admin routes
	React.useEffect(()=>{
		if (!user) return; // not logged in or unknown
		const teacherOnly = (user && Number(user.role_id) === 5);
		if (!teacherOnly) return;
		const adminPaths = ['/attendancemgmt','/building','/rooms','/users','/programs','/departments','/floors','/sections','/subjects','/subjectsoffering'];
		if (adminPaths.some(p=> route.startsWith(p))) {
			window.location.hash = '#/dashboard';
		}
	}, [route, user]);

	let View = null;
	// Ensure more specific route for attendance management is checked before the more generic attendance route
	if (route.startsWith('/attendancemgmt')) View = AttedanceManagement || (()=>React.createElement('div',null,'Attedance management'));
	else if (route.startsWith('/attendance')) View = AttendancePage || Attendance;
	else if (route.startsWith('/dashboard')) View = DashboardPage || Dashboard;
	else if (route.startsWith('/login')) View = LoginPage || Login;
	else if (route.startsWith('/3d-building')) View = ThreeDBuildingIndex;
	else if (route.startsWith('/building')) View = BuildingIndex;
	else if (route.startsWith('/rooms')) View = RoomIndex || RoomIndex;
	else if (route.startsWith('/users')) View = UserIndex;
	else if (route.startsWith('/programs')) View = ProgramIndex;
	else if (route.startsWith('/departments')) View = DepartmentIndex;
	else if (route.startsWith('/floors')) View = FloorIndex;
	else if (route.startsWith('/sections')) View = SectionIndex;
	else if (route.startsWith('/class-schedules')) View = ClassScheduleIndex;
	else if (route.startsWith('/semesters')) View = SemesterIndex;
	else if (route.startsWith('/subject-offerings')) View = SubjectOfferingIndex;
	else if (route.startsWith('/subjects')) View = SubjectIndex || (()=>React.createElement('div',null,'Subjects'));
	else View = DashboardPage || Dashboard;
	return (
		<AuthProvider>
			<div>
				{!route.startsWith('/login') && <Navbar />}
				{/* only apply padding on non-login pages */}
				<div style={{ padding: route.startsWith('/login') ? 0 : 20 }}>
					<View />
				</div>
			</div>
		</AuthProvider>
	);
}

export default App;
