const { createContext, useState } = React;
const AuthContext = createContext(null);
function AuthProvider({ children }) {
  const storedUser = (() => { try { return JSON.parse(localStorage.getItem('user') || 'null'); } catch(e) { return null; } })();
  const [user, setUser] = useState(storedUser);
  const login = (u, token) => {
    setUser(u);
    try { localStorage.setItem('user', JSON.stringify(u)); } catch(e){}
    if (token) try { localStorage.setItem('token', token); } catch(e){}
  };
  const logout = () => {
    setUser(null);
    try { localStorage.removeItem('user'); localStorage.removeItem('token'); } catch(e){}
    window.location.hash = '#/login';
  };
  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export { AuthContext, AuthProvider };
