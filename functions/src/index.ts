import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
// import { FieldValue } from "firebase-admin/firestore";
import express, {Request, Response} from "express";
import cors from "cors";

admin.initializeApp();
const db = admin.firestore();
// const FieldValue = admin.firestore.FieldValue;

const app = express();
app.use(cors({origin: true}));
// Middleware để xử lý JSON
app.use(express.json({limit: "50mb"}));

// Export express app as a Firebase Function với cấu hình timeout và bộ nhớ
export const api = functions.https.onRequest(
  {
    timeoutSeconds: 540, // Tối đa 9 phút
    memory: "1GiB", // Tăng bộ nhớ nếu cần
  },
  app
);

app.use(express.json());
/* eslint-disable require-jsdoc */
function generateKeywords(text: string): string[] {
  if (!text) return [];
  text = text.toLowerCase().trim();

  const keywords: string[] = [];

  // Cắt theo từ (ví dụ: "pham ngoc tam")
  const parts = text.split(/\s+/);

  // Thêm từng từ đầy đủ
  keywords.push(...parts);

  // Thêm các prefix để search theo "startsWith"
  for (const part of parts) {
    let prefix = "";
    for (const char of part) {
      prefix += char;
      keywords.push(prefix); // p, ph, pha, pham...
    }
  }

  return Array.from(new Set(keywords)); // loại trùng
}
/* eslint-enable require-jsdoc */

app.post("/login", async (req: Request, res: Response) => {
  try {
    const {username, password} = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: "Thiếu username hoặc password",
      });
    }

    // Kiểm tra username có tồn tại
    const userQuery = await db
      .collection("users")
      .where("username", "==", username)
      .limit(1)
      .get();

    if (userQuery.empty) {
      return res.status(404).json({
        success: false,
        message: "Username không tồn tại",
      });
    }

    const user = userQuery.docs[0].data();

    // Kiểm tra password (⚠️ nên hash để so sánh)
    if (user.password !== password) {
      return res.status(401).json({
        success: false,
        message: "Sai mật khẩu",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Đăng nhập thành công",
      user: {id: userQuery.docs[0].id, username: user.username},
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({
      success: false,
      message: "Lỗi server, vui lòng thử lại sau",
    });
  }
});

// ================== PROFILE API ==================

// Thêm profile cho 1 user
app.post("/profile/add", async (req: Request, res: Response) => {
  try {
    const {userId, profile} = req.body;

    if (!userId || !profile) {
      return res
        .status(400)
        .json({success: false, message: "Thiếu userId hoặc profile"});
    }

    // Tạo keywords từ các field cần search
    const keywords = [
      ...generateKeywords(profile.hovaten),
      ...generateKeywords(profile.sdt),
      ...generateKeywords(profile.cccd),
      ...generateKeywords(profile.diachi),
    ];

    // Thêm userId vào profile
    const newProfile = {
      ...profile,
      userId,
      keywords,
      createdAt: new Date(),
    };

    const docRef = await db.collection("profiles").add(newProfile);

    return res.status(200).json({
      success: true,
      message: "Thêm profile thành công",
      id: docRef.id,
    });
  } catch (error) {
    console.error("Add profile error:", error);
    return res.status(500).json({success: false, message: "Lỗi server"});
  }
});

// Lấy toàn bộ profile theo userId
app.get("/profile/:userId", async (req: Request, res: Response) => {
  try {
    const {userId} = req.params;

    const snapshot = await db
      .collection("profiles")
      .where("userId", "==", userId)
      .get();

    const profiles = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    return res.status(200).json({success: true, profiles});
  } catch (error) {
    console.error("Get profile error:", error);
    return res.status(500).json({success: false, message: "Lỗi server"});
  }
});

// Lấy chi tiết 1 profile theo profileId
app.get("/profile/`detail`/:profileId", async (req: Request, res: Response) => {
  try {
    const {profileId} = req.params;

    if (!profileId) {
      return res
        .status(400)
        .json({success: false, message: "Thiếu profileId"});
    }

    const docRef = await db.collection("profiles").doc(profileId).get();

    if (!docRef.exists) {
      return res
        .status(404)
        .json({success: false, message: "Profile không tồn tại"});
    }

    return res.status(200).json({
      success: true,
      profile: {id: docRef.id, ...docRef.data()},
    });
  } catch (error) {
    console.error("Get profile detail error:", error);
    return res
      .status(500)
      .json({success: false, message: "Lỗi server"});
  }
});


// Cập nhật profile theo profileId
app.put("/profile/update/:profileId", async (req: Request, res: Response) => {
  try {
    const {profileId} = req.params;
    const {profile} = req.body;

    if (!profileId || !profile) {
      return res
        .status(400)
        .json({success: false, message: "Thiếu profileId hoặc profile"});
    }

    // Tạo lại keywords từ các field search
    const keywords = [
      ...generateKeywords(profile.hovaten),
      ...generateKeywords(profile.sdt),
      ...generateKeywords(profile.cccd),
      ...generateKeywords(profile.diachi),
    ];

    const updateData = {
      ...profile,
      keywords,
      updatedAt: new Date(),
    };

    await db.collection("profiles").doc(profileId).update(updateData);

    return res.status(200).json({
      success: true,
      message: "Cập nhật profile thành công",
    });
  } catch (error) {
    console.error("Update profile error:", error);
    return res.status(500).json({success: false, message: "Lỗi server"});
  }
});


// Tìm kiếm profile theo userId + keyword (họ tên, sdt, cccd, ...)
app.get("/profile/search/:userId", async (req: Request, res: Response) => {
  try {
    const {userId} = req.params;
    const {keyword} = req.query;

    if (!keyword) {
      return res.status(400).json({success: false, message: "Thiếu keyword"});
    }

    const snapshot = await db
      .collection("profiles")
      .where("userId", "==", userId)
      .where("keywords", "array-contains", (keyword as string).toLowerCase())
      .get();

    const results = snapshot.docs.map((doc) => ({id: doc.id, ...doc.data()}));

    return res.status(200).json({success: true, results});
  } catch (error) {
    console.error("Search profile error:", error);
    return res.status(500).json({success: false, message: "Lỗi server"});
  }
});
