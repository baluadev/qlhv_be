// import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
// import { FieldValue } from "firebase-admin/firestore";
import express, { Request, Response } from "express";
import cors from "cors";

admin.initializeApp();
const db = admin.firestore();
// const FieldValue = admin.firestore.FieldValue;

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

app.post("/login", async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;

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
      user: { id: userQuery.docs[0].id, username: user.username },
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
    const { userId, profile } = req.body;

    if (!userId || !profile) {
      return res
        .status(400)
        .json({ success: false, message: "Thiếu userId hoặc profile" });
    }

    // Thêm userId vào profile
    profile.userId = userId;

    const docRef = await db.collection("profiles").add(profile);

    return res.status(200).json({
      success: true,
      message: "Thêm profile thành công",
      id: docRef.id,
    });
  } catch (error) {
    console.error("Add profile error:", error);
    return res.status(500).json({ success: false, message: "Lỗi server" });
  }
});

// Lấy toàn bộ profile theo userId
app.get("/profile/:userId", async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    const snapshot = await db
      .collection("profiles")
      .where("userId", "==", userId)
      .get();

    const profiles = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    return res.status(200).json({ success: true, profiles });
  } catch (error) {
    console.error("Get profile error:", error);
    return res.status(500).json({ success: false, message: "Lỗi server" });
  }
});

// Tìm kiếm profile theo userId + keyword (họ tên, sdt, cccd, ...)
app.get("/profile/search/:userId", async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { keyword } = req.query;

    if (!keyword) {
      return res.status(400).json({ success: false, message: "Thiếu keyword" });
    }

    // ⚡ Firestore không hỗ trợ OR search trực tiếp, nên phải query nhiều field và gộp kết quả
    const results: any[] = [];

    const fields = ["hovaten", "sdt", "cccd", "diachi"];
    for (const field of fields) {
      const snapshot = await db
        .collection("profiles")
        .where("userId", "==", userId)
        .where(field, "==", keyword) // hoặc ">= keyword" + "<= keyword + \uf8ff" nếu muốn LIKE search
        .get();

      snapshot.docs.forEach((doc) => {
        const data = { id: doc.id, ...doc.data() };
        if (!results.find((r) => r.id === data.id)) {
          results.push(data);
        }
      });
    }

    return res.status(200).json({ success: true, results });
  } catch (error) {
    console.error("Search profile error:", error);
    return res.status(500).json({ success: false, message: "Lỗi server" });
  }
});
